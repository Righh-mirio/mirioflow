//! Live typing: partial transcripts are typed into the focused app while the
//! user speaks, then corrected in place when each utterance's final arrives.
//!
//! What the focused app should show is a `Target`; `Screen` turns it into
//! keystrokes from what was typed so far, and `run` types each new target on
//! a dedicated thread.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError, TryRecvError};
use std::time::Duration;

use unicode_segmentation::UnicodeSegmentation;

use crate::utterance_cleaner::UtteranceCleaner;

/// The text the focused app should show: the finals so far, then the
/// provisional text of the utterance still being spoken.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Target {
    pub text: String,
    /// Byte length of the finals at the start of `text`. Finals are
    /// append-only, so this prefix is never deleted once typed.
    pub committed: usize,
}

impl Target {
    pub fn new(cleaner: &UtteranceCleaner, provisional: &Provisional) -> Self {
        let committed = cleaner.accumulated_text();
        let mut text = committed.to_owned();
        if let Some(partial) = &provisional.open {
            let start = partial.layout_start(cleaner.last_final_end());
            text.push_str(&cleaner.preview(&partial.text, start));
        }
        Self {
            text,
            committed: committed.len(),
        }
    }
}

/// A partial whose start is within this of the last final's end carries no
/// start of its own (see `OpenPartial::layout_start`).
const START_EPSILON_SECS: f64 = 0.01;

/// Rough speaking rate, to date the first words of a partial back from its end.
const SPOKEN_CHARS_PER_SEC: f64 = 15.0;

#[derive(Debug)]
struct OpenPartial {
    id: Option<String>,
    text: String,
    start: f64,
    /// `end` and character count of the utterance's first partial.
    first_end: f64,
    first_chars: usize,
}

impl OpenPartial {
    /// Whether `start` is the utterance's own. Gladia Enterprise hosts give
    /// every partial the previous utterance's end as its start; only the
    /// final has the real one.
    fn has_own_start(&self, last_final_end: Option<f64>) -> bool {
        last_final_end.is_none_or(|prev_end| self.start > prev_end + START_EPSILON_SECS)
    }

    /// The start the utterance is laid out with, which decides whether it
    /// continues the previous sentence. Without its own start, the speech is
    /// dated back from the first partial's end by the length of its text:
    /// guessing "continuation" every time would make each new sentence
    /// retype the whole utterance when its final adds the period back.
    fn layout_start(&self, last_final_end: Option<f64>) -> f64 {
        match last_final_end {
            Some(prev_end) if !self.has_own_start(last_final_end) => {
                let spoken = self.first_chars as f64 / SPOKEN_CHARS_PER_SEC;
                (self.first_end - spoken).max(prev_end)
            }
            _ => self.start,
        }
    }
}

/// The latest partial whose final has not arrived yet.
///
/// Gladia sends utterances one after another, and a partial carries the whole
/// current hypothesis for its utterance, so one slot is enough: a newer
/// utterance's partial replaces it. Ids (`"<channel>_<seq>"`, zero-padded)
/// sort in speaking order.
#[derive(Debug, Default)]
pub struct Provisional {
    open: Option<OpenPartial>,
    last_final_id: Option<String>,
}

impl Provisional {
    /// Records a partial. Returns whether the provisional text changed.
    pub fn partial(&mut self, id: Option<String>, text: &str, start: f64, end: f64) -> bool {
        if let (Some(id), Some(last_final)) = (&id, &self.last_final_id) {
            // A late partial of an utterance that already has its final.
            if id <= last_final {
                return false;
            }
        }
        if let (Some(id), Some(open)) = (&id, &self.open) {
            if open.id.as_ref().is_some_and(|open_id| id < open_id) {
                return false;
            }
        }
        if self
            .open
            .as_ref()
            .is_some_and(|open| open.id == id && open.text == text)
        {
            return false;
        }
        let (first_end, first_chars) = match &self.open {
            Some(open) if open.id == id && open.first_chars > 0 => {
                (open.first_end, open.first_chars)
            }
            _ => (end, text.trim().chars().count()),
        };
        self.open = Some(OpenPartial {
            id,
            text: text.to_owned(),
            start,
            first_end,
            first_chars,
        });
        true
    }

    /// The start to clean a final with. When its partial had no start of its
    /// own, the final keeps the estimated one the partial was laid out with,
    /// so the sentence boundary already typed (period, capital) stays as is.
    pub fn final_start(&self, id: Option<&String>, start: f64, last_final_end: Option<f64>) -> f64 {
        match &self.open {
            Some(open)
                if (open.id.as_ref() == id || open.id.is_none() || id.is_none())
                    && !open.has_own_start(last_final_end) =>
            {
                open.layout_start(last_final_end)
            }
            _ => start,
        }
    }

    /// Records a final: the partial it replaces stops being provisional.
    pub fn finalized(&mut self, id: Option<String>) {
        let replaced = match (&id, self.open.as_ref().and_then(|open| open.id.as_ref())) {
            (Some(id), Some(open_id)) => open_id <= id,
            _ => true,
        };
        if replaced {
            self.open = None;
        }
        if id > self.last_final_id {
            self.last_final_id = id;
        }
    }

    /// Drops the open partial (the session ended without its final).
    pub fn clear(&mut self) {
        self.open = None;
    }
}

/// One keystroke batch: delete `backspaces` characters, then type `insert`.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Edit {
    /// Grapheme clusters to delete, which is what one Backspace removes.
    pub backspaces: usize,
    pub insert: String,
}

impl Edit {
    pub fn is_empty(&self) -> bool {
        self.backspaces == 0 && self.insert.is_empty()
    }
}

/// Byte length of the longest common prefix, cut on grapheme boundaries.
fn common_prefix(a: &str, b: &str) -> usize {
    a.graphemes(true)
        .zip(b.graphemes(true))
        .take_while(|(x, y)| x == y)
        .map(|(x, _)| x.len())
        .sum()
}

/// What this session has typed into the focused app.
#[derive(Debug, Default)]
pub struct Screen {
    typed: String,
    /// Byte length of the finals at the start of `typed`.
    committed: usize,
}

impl Screen {
    /// The keystrokes that turn what was typed into `target`, or `None` when
    /// they would delete text from a final (never expected; the caller stops
    /// typing for the session).
    pub fn edit_to(&self, target: &Target) -> Option<Edit> {
        let keep = common_prefix(&self.typed, &target.text);
        if keep < self.committed {
            return None;
        }
        Some(Edit {
            backspaces: self.typed[keep..].graphemes(true).count(),
            insert: target.text[keep..].to_owned(),
        })
    }

    /// Records that `target` is now on screen.
    pub fn typed(&mut self, target: &Target) {
        self.typed.clone_from(&target.text);
        self.committed = self.committed.max(target.committed.min(self.typed.len()));
    }

    #[cfg(test)]
    fn text(&self) -> &str {
        &self.typed
    }
}

/// Whether the trigger key includes a modifier. On Windows, keys sent while
/// one is physically held combine with it (Ctrl+Backspace deletes a word), so
/// live typing waits until a held hotkey is released.
pub fn hotkey_holds_modifier(hotkey: &str) -> bool {
    hotkey.split('+').any(|key| {
        let key = key.trim().to_ascii_lowercase();
        let key = key.trim_end_matches("left").trim_end_matches("right");
        matches!(
            key,
            "ctrl"
                | "control"
                | "alt"
                | "option"
                | "shift"
                | "cmd"
                | "command"
                | "meta"
                | "super"
                | "win"
        )
    })
}

/// Where live typing sends keystrokes.
pub trait Keyboard {
    fn type_edit(&mut self, backspaces: usize, text: &str) -> Result<(), String>;
    fn focus_owner(&self) -> Option<u64>;
}

/// The real keyboard (`keystrokes`).
pub struct SystemKeyboard;

impl Keyboard for SystemKeyboard {
    fn type_edit(&mut self, backspaces: usize, text: &str) -> Result<(), String> {
        crate::keystrokes::type_edit(backspaces, text)
    }

    fn focus_owner(&self) -> Option<u64> {
        crate::keystrokes::focus_owner()
    }
}

/// How a live-typing session went (counts only, never text).
#[derive(Debug, Default)]
pub struct Report {
    /// Why typing stopped before the end, leaving the screen incomplete.
    pub stopped: Option<&'static str>,
    pub targets: usize,
    pub edits: usize,
    pub backspaces: usize,
    pub typed: usize,
}

/// How often a held hotkey is checked for release.
const HOLD_POLL: Duration = Duration::from_millis(50);

/// Types each target as it arrives, skipping to the newest when several are
/// queued, until the sender is dropped. While `held` is set (the hotkey is
/// still down, see `hotkey_holds_modifier`), edits wait. Typing stops for
/// good if keyboard focus leaves the window it started in.
pub fn run(
    targets: Receiver<Target>,
    keyboard: &mut impl Keyboard,
    held: Option<&AtomicBool>,
) -> Report {
    let mut report = Report::default();
    let mut screen = Screen::default();
    let focus = keyboard.focus_owner();
    let mut latest: Option<Target> = None;
    let mut closed = false;
    loop {
        if latest.is_none() {
            if closed {
                break;
            }
            match targets.recv() {
                Ok(target) => latest = Some(target),
                Err(_) => break,
            }
            report.targets += 1;
        }
        loop {
            match targets.try_recv() {
                Ok(target) => {
                    report.targets += 1;
                    latest = Some(target);
                }
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => {
                    closed = true;
                    break;
                }
            }
        }
        if !closed && held.is_some_and(|held| held.load(Ordering::SeqCst)) {
            match targets.recv_timeout(HOLD_POLL) {
                Ok(target) => {
                    report.targets += 1;
                    latest = Some(target);
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => closed = true,
            }
            continue;
        }
        if let Some(target) = latest.take() {
            if let Err(reason) = type_target(&mut screen, &target, keyboard, focus, &mut report) {
                report.stopped = Some(reason);
                break;
            }
        }
    }
    report
}

fn type_target(
    screen: &mut Screen,
    target: &Target,
    keyboard: &mut impl Keyboard,
    focus: Option<u64>,
    report: &mut Report,
) -> Result<(), &'static str> {
    let edit = screen
        .edit_to(target)
        .ok_or("an edit would have deleted a final")?;
    if !edit.is_empty() {
        if keyboard.focus_owner() != focus {
            return Err("keyboard focus moved to another window");
        }
        keyboard
            .type_edit(edit.backspaces, &edit.insert)
            .map_err(|error| {
                log::error!("[live-typing] keystrokes failed: {error}");
                "keystrokes failed"
            })?;
        report.edits += 1;
        report.backspaces += edit.backspaces;
        report.typed += edit.insert.graphemes(true).count();
    }
    screen.typed(target);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target(text: &str, committed: usize) -> Target {
        Target {
            text: text.to_owned(),
            committed,
        }
    }

    #[test]
    fn edit_keeps_the_common_prefix() {
        let mut screen = Screen::default();
        screen.typed(&target("hello wor", 0));
        assert_eq!(
            screen.edit_to(&target("hello world", 0)),
            Some(Edit {
                backspaces: 0,
                insert: "ld".to_owned()
            })
        );
        assert_eq!(
            screen.edit_to(&target("hello war", 0)),
            Some(Edit {
                backspaces: 2,
                insert: "ar".to_owned()
            })
        );
        assert_eq!(
            screen.edit_to(&target("", 0)),
            Some(Edit {
                backspaces: 9,
                insert: String::new()
            })
        );
        assert!(screen.edit_to(&target("hello wor", 0)).unwrap().is_empty());
    }

    #[test]
    fn edit_counts_backspaces_in_graphemes() {
        let mut screen = Screen::default();
        // "e" + combining acute, a family emoji (ZWJ sequence), CJK.
        screen.typed(&target("cafe\u{301} 👨‍👩‍👧 日本", 0));
        assert_eq!(
            screen.edit_to(&target("cafe\u{301}", 0)),
            Some(Edit {
                backspaces: 5,
                insert: String::new()
            })
        );
        // Changing the accent replaces the whole cluster, not half of it.
        assert_eq!(
            screen.edit_to(&target("cafe", 0)),
            Some(Edit {
                backspaces: 6,
                insert: "e".to_owned()
            })
        );
    }

    #[test]
    fn edit_never_deletes_typed_finals() {
        let mut screen = Screen::default();
        screen.typed(&target("Hello there", 5));
        assert!(screen.edit_to(&target("Hello world", 5)).is_some());
        assert_eq!(screen.edit_to(&target("Help", 0)), None);
    }

    #[test]
    fn late_and_stale_partials_are_ignored() {
        let mut p = Provisional::default();
        assert!(p.partial(Some("00_00000001".into()), "hel", 0.0, 0.0));
        assert!(!p.partial(Some("00_00000001".into()), "hel", 0.0, 0.0));
        assert!(p.partial(Some("00_00000001".into()), "hello", 0.0, 0.0));
        p.finalized(Some("00_00000001".into()));
        assert!(p.open.is_none());
        assert!(!p.partial(Some("00_00000001".into()), "hello wo", 0.0, 0.0));
        assert!(p.partial(Some("00_00000002".into()), "next", 2.0, 2.0));
        assert!(!p.partial(Some("00_00000001".into()), "older", 0.0, 0.0));
        // A final of an older utterance keeps the newer partial open.
        p.finalized(Some("00_00000001".into()));
        assert!(p.open.is_some());
    }

    #[test]
    fn partials_without_ids_are_replaced_by_any_final() {
        let mut p = Provisional::default();
        assert!(p.partial(None, "one", 0.0, 0.0));
        assert!(p.partial(None, "one two", 0.0, 0.0));
        p.finalized(None);
        assert!(p.open.is_none());
        assert!(p.partial(None, "three", 2.0, 2.0));
    }

    /// Applies edits to a string, like a text field would.
    #[derive(Clone, Default)]
    struct FakeKeyboard {
        text: std::sync::Arc<std::sync::Mutex<String>>,
        edits: std::sync::Arc<std::sync::Mutex<usize>>,
        focus: std::sync::Arc<std::sync::atomic::AtomicU64>,
    }

    impl Keyboard for FakeKeyboard {
        fn type_edit(&mut self, backspaces: usize, text: &str) -> Result<(), String> {
            let mut screen = self.text.lock().unwrap();
            for _ in 0..backspaces {
                let last = screen.graphemes(true).next_back().map_or(0, str::len);
                let len = screen.len() - last;
                screen.truncate(len);
            }
            screen.push_str(text);
            *self.edits.lock().unwrap() += 1;
            Ok(())
        }

        fn focus_owner(&self) -> Option<u64> {
            Some(self.focus.load(Ordering::SeqCst))
        }
    }

    impl FakeKeyboard {
        fn text(&self) -> String {
            self.text.lock().unwrap().clone()
        }
    }

    #[test]
    fn queued_targets_collapse_into_one_edit() {
        let (tx, rx) = std::sync::mpsc::channel();
        for text in ["he", "hel", "hello", "hello wor", "Hello world"] {
            tx.send(target(text, 0)).unwrap();
        }
        drop(tx);
        let mut keyboard = FakeKeyboard::default();
        let report = run(rx, &mut keyboard, None);
        assert_eq!(keyboard.text(), "Hello world");
        assert_eq!(report.targets, 5);
        assert_eq!(report.edits, 1);
        assert!(report.stopped.is_none());
    }

    #[test]
    fn edits_correct_what_was_typed() {
        let (tx, rx) = std::sync::mpsc::channel();
        let keyboard = FakeKeyboard::default();
        let worker = {
            let mut keyboard = keyboard.clone();
            std::thread::spawn(move || run(rx, &mut keyboard, None))
        };
        for (text, committed) in [("I red", 0), ("I read the", 0), ("I read the book", 15)] {
            tx.send(target(text, committed)).unwrap();
            std::thread::sleep(Duration::from_millis(20));
        }
        drop(tx);
        let report = worker.join().unwrap();
        assert_eq!(keyboard.text(), "I read the book");
        assert!(report.backspaces >= 1);
    }

    #[test]
    fn typing_stops_when_focus_moves() {
        let (tx, rx) = std::sync::mpsc::channel();
        let keyboard = FakeKeyboard::default();
        let worker = {
            let mut keyboard = keyboard.clone();
            std::thread::spawn(move || run(rx, &mut keyboard, None))
        };
        tx.send(target("Hello", 0)).unwrap();
        std::thread::sleep(Duration::from_millis(30));
        keyboard.focus.store(7, Ordering::SeqCst);
        tx.send(target("Hello world", 0)).unwrap();
        let report = worker.join().unwrap();
        assert_eq!(keyboard.text(), "Hello");
        assert_eq!(
            report.stopped,
            Some("keyboard focus moved to another window")
        );
        // The worker has returned: later targets go nowhere.
        assert!(tx.send(target("Hello world!", 0)).is_err());
    }

    #[test]
    fn edits_wait_for_a_held_hotkey() {
        let (tx, rx) = std::sync::mpsc::channel();
        let keyboard = FakeKeyboard::default();
        let held = std::sync::Arc::new(AtomicBool::new(true));
        let worker = {
            let mut keyboard = keyboard.clone();
            let held = held.clone();
            std::thread::spawn(move || run(rx, &mut keyboard, Some(&held)))
        };
        tx.send(target("Hel", 0)).unwrap();
        tx.send(target("Hello", 0)).unwrap();
        std::thread::sleep(HOLD_POLL * 3);
        assert_eq!(keyboard.text(), "");
        held.store(false, Ordering::SeqCst);
        std::thread::sleep(HOLD_POLL * 3);
        assert_eq!(keyboard.text(), "Hello");
        tx.send(target("Hello world", 0)).unwrap();
        drop(tx);
        let report = worker.join().unwrap();
        assert_eq!(keyboard.text(), "Hello world");
        assert_eq!(report.edits, 2);
    }

    #[test]
    fn the_end_of_the_session_is_typed_even_if_the_hotkey_looks_held() {
        let (tx, rx) = std::sync::mpsc::channel();
        tx.send(target("Hello.", 6)).unwrap();
        drop(tx);
        let mut keyboard = FakeKeyboard::default();
        let held = AtomicBool::new(true);
        run(rx, &mut keyboard, Some(&held));
        assert_eq!(keyboard.text(), "Hello.");
    }

    #[test]
    fn modifier_hotkeys_are_detected() {
        for hotkey in [
            "Ctrl",
            "CtrlLeft",
            "Ctrl+Space",
            "Alt+D",
            "Cmd+Shift+D",
            "ShiftRight",
        ] {
            assert!(hotkey_holds_modifier(hotkey), "{hotkey}");
        }
        for hotkey in ["Fn", "F8", "CapsLock"] {
            assert!(!hotkey_holds_modifier(hotkey), "{hotkey}");
        }
    }

    /// Replays a session the way the subscription task does and checks that
    /// the screen ends on the cleaned transcript without ever deleting a final.
    #[test]
    fn a_session_ends_on_the_cleaned_transcript() {
        enum Ev {
            P(&'static str, &'static str, f64),
            F(&'static str, &'static str, f64, f64),
        }
        use Ev::*;
        let events = [
            P("00_00000000", "So", 0.0),
            P("00_00000000", "So I think", 0.0),
            P("00_00000000", "So I think that we", 0.0),
            F("00_00000000", "So I think that we should.", 0.0, 1.8),
            P("00_00000000", "So I think that we should go", 0.0),
            P("00_00000001", "Ship", 2.0),
            P("00_00000001", "Ship it today", 2.0),
            F("00_00000001", "Ship it today.", 2.0, 3.0),
            P("00_00000002", "Thanks", 5.0),
        ];
        let mut cleaner = UtteranceCleaner::new();
        let mut provisional = Provisional::default();
        let mut screen = Screen::default();
        for event in events {
            match event {
                P(id, text, start) => {
                    provisional.partial(Some(id.into()), text, start, start);
                }
                F(id, text, start, end) => {
                    cleaner.process_final(text, start, end);
                    provisional.finalized(Some(id.into()));
                }
            }
            let target = Target::new(&cleaner, &provisional);
            assert!(screen.edit_to(&target).is_some(), "at {:?}", target.text);
            screen.typed(&target);
        }
        assert_eq!(
            screen.text(),
            "So I think that we should ship it today. Thanks"
        );

        // The session ends without a final for the last partial.
        cleaner.flush_pending_period();
        provisional.clear();
        let target = Target::new(&cleaner, &provisional);
        assert_eq!(
            screen.edit_to(&target),
            Some(Edit {
                backspaces: 7,
                insert: String::new()
            })
        );
        screen.typed(&target);
        assert_eq!(screen.text(), cleaner.accumulated_text());
    }

    enum Event {
        /// id, text, start, end
        Partial(&'static str, &'static str, f64, f64),
        Final(&'static str, &'static str, f64, f64),
    }

    /// Replays events the way the subscription task does in live-typing
    /// mode; returns what was typed and the backspaces it took.
    fn replay(events: &[Event]) -> (String, usize) {
        let mut cleaner = UtteranceCleaner::new();
        let mut provisional = Provisional::default();
        let mut screen = Screen::default();
        let mut backspaces = 0;
        for event in events {
            match *event {
                Event::Partial(id, text, start, end) => {
                    provisional.partial(Some(id.into()), text, start, end);
                }
                Event::Final(id, text, start, end) => {
                    let id = Some(id.to_owned());
                    let start =
                        provisional.final_start(id.as_ref(), start, cleaner.last_final_end());
                    cleaner.process_final(text, start, end);
                    provisional.finalized(id);
                }
            }
            let target = Target::new(&cleaner, &provisional);
            backspaces += screen.edit_to(&target).expect("deleted a final").backspaces;
            screen.typed(&target);
        }
        cleaner.flush_pending_period();
        provisional.clear();
        let target = Target::new(&cleaner, &provisional);
        backspaces += screen.edit_to(&target).expect("deleted a final").backspaces;
        screen.typed(&target);
        assert_eq!(screen.text(), cleaner.accumulated_text());
        (screen.text().to_owned(), backspaces)
    }

    /// Gladia Enterprise (eu1, solaria-1) timings: each partial starts at the
    /// previous final's end, the final has the real start. Sentence breaks
    /// must not retype the utterance when the final lands.
    #[test]
    fn partials_without_their_own_start_keep_sentence_breaks() {
        use Event::*;
        let (text, backspaces) = replay(&[
            Partial("00_00000000", "Hello", 0.0, 0.96),
            Final("00_00000000", "Hello team.", 0.80, 1.36),
            // 1.2 s pause: a continuation.
            Partial("00_00000001", "we are", 1.36, 2.88),
            Partial("00_00000001", "we are testing live typing", 1.36, 4.0),
            Final("00_00000001", "We are testing live typing.", 2.56, 5.92),
            // 1.9 s pause: a new sentence.
            Partial("00_00000002", "The", 5.92, 8.0),
            Partial("00_00000002", "The quick brown fox", 5.92, 9.2),
            Final("00_00000002", "The quick brown fox.", 7.84, 12.32),
        ]);
        assert_eq!(
            text,
            "Hello team we are testing live typing. The quick brown fox."
        );
        assert_eq!(backspaces, 0);
    }

    /// When the estimate and the final's own start disagree (solaria-3's
    /// partials come about a second late), the boundary already typed wins.
    #[test]
    fn a_final_keeps_the_sentence_break_its_partial_typed() {
        use Event::*;
        let (text, backspaces) = replay(&[
            Final("00_00000000", "Thanks for dinner.", 0.0, 1.0),
            // Dated back to 3.0 s (2 s gap) though the final says 2.2 s.
            Partial("00_00000001", "Please", 1.0, 3.4),
            Partial("00_00000001", "Please send it", 1.0, 4.0),
            Final("00_00000001", "Please send it.", 2.2, 4.0),
        ]);
        assert_eq!(text, "Thanks for dinner. Please send it.");
        assert_eq!(backspaces, 0);
    }

    /// The global API gives partials their own start: it is used as is, and
    /// finals keep theirs.
    #[test]
    fn a_partial_with_its_own_start_is_laid_out_with_it() {
        let mut p = Provisional::default();
        p.partial(Some("00_00000001".into()), "Please", 1.2, 3.4);
        let open = p.open.as_ref().unwrap();
        assert!(open.has_own_start(Some(1.0)));
        assert_eq!(open.layout_start(Some(1.0)), 1.2);
        assert_eq!(
            p.final_start(Some(&"00_00000001".into()), 1.25, Some(1.0)),
            1.25
        );

        // Without its own start: dated back from the first partial's end.
        p.partial(Some("00_00000002".into()), "Please", 1.0, 3.4);
        p.partial(Some("00_00000002".into()), "Please send", 1.0, 3.9);
        let estimate = 3.4 - 6.0 / SPOKEN_CHARS_PER_SEC;
        let open = p.open.as_ref().unwrap();
        assert!(!open.has_own_start(Some(1.0)));
        assert!((open.layout_start(Some(1.0)) - estimate).abs() < 1e-9);
        // Never before the previous final's end.
        assert_eq!(open.layout_start(Some(3.3)), 3.3);
        // A final of another utterance keeps its own start.
        assert_eq!(
            p.final_start(Some(&"00_00000003".into()), 5.0, Some(1.0)),
            5.0
        );
    }
}

//! Live typing: partial transcripts are typed into the focused app while the
//! user speaks, then corrected in place when each utterance's final arrives.
//!
//! This module is the pure part: what the focused app should show (`Target`),
//! and the keystrokes that get it there from what was typed so far (`Screen`).

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
            text.push_str(&cleaner.preview(&partial.text, partial.start));
        }
        Self {
            text,
            committed: committed.len(),
        }
    }
}

#[derive(Debug)]
struct OpenPartial {
    id: Option<String>,
    text: String,
    start: f64,
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
    pub fn partial(&mut self, id: Option<String>, text: &str, start: f64) -> bool {
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
        self.open = Some(OpenPartial {
            id,
            text: text.to_owned(),
            start,
        });
        true
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

    pub fn text(&self) -> &str {
        &self.typed
    }
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
        assert!(p.partial(Some("00_00000001".into()), "hel", 0.0));
        assert!(!p.partial(Some("00_00000001".into()), "hel", 0.0));
        assert!(p.partial(Some("00_00000001".into()), "hello", 0.0));
        p.finalized(Some("00_00000001".into()));
        assert!(p.open.is_none());
        assert!(!p.partial(Some("00_00000001".into()), "hello wo", 0.0));
        assert!(p.partial(Some("00_00000002".into()), "next", 2.0));
        assert!(!p.partial(Some("00_00000001".into()), "older", 0.0));
        // A final of an older utterance keeps the newer partial open.
        p.finalized(Some("00_00000001".into()));
        assert!(p.open.is_some());
    }

    #[test]
    fn partials_without_ids_are_replaced_by_any_final() {
        let mut p = Provisional::default();
        assert!(p.partial(None, "one", 0.0));
        assert!(p.partial(None, "one two", 0.0));
        p.finalized(None);
        assert!(p.open.is_none());
        assert!(p.partial(None, "three", 2.0));
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
                    provisional.partial(Some(id.into()), text, start);
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
}

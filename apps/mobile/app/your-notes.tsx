import { MyNotesScreen } from '../src/components/feedback/MyNotesScreen';

// Your notes — the submitter's own side of the feedback loop (ADR 0019), the
// native mobile mirror of the web /feedback page. Reached from the FeedbackSheet's
// "See your notes" action after a submit.
export default function YourNotes() {
  return <MyNotesScreen />;
}
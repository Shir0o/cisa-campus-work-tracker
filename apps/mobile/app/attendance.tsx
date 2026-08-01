import { GatheringsScreen } from '../src/components/attendance/GatheringsScreen';

// Gatherings — who we've missed, the sessions we've had with their rosters, and
// what's coming, in the v2 language (the design's `M2Gatherings`,
// views/mobile/screens.jsx).
//
// Always a pushed screen: the trainee reaches it from the ☰ drawer, the
// full-timer from More, and members from their home's "Full calendar".
export default function Attendance() {
  return <GatheringsScreen />;
}

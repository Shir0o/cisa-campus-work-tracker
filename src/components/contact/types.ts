export interface ContactTeamMember {
  id: string;
  name: string;
  role: string;
  initials: string;
  fullTimer: boolean;
  /** The users doc's photo, when they have one (#1669). */
  photoURL?: string;
}

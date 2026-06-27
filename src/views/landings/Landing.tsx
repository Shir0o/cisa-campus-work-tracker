import React from "react";
import { useAuth } from "../../components/AuthProvider";
import MyDay from "../MyDay";
import LandingTrainee from "./LandingTrainee";
import LandingStudent from "./LandingStudent";
import LandingCommunity from "./LandingCommunity";

// Role-dispatched home, served at "/". Each role lands on a page geared to its
// scope: Full-timers get the My Day cockpit; Trainees, Students and Community
// members each get a tailored landing. Unknown/approved roles fall back to My Day.
export default function Landing() {
  const { role } = useAuth();
  if (role === "manager") return <LandingTrainee />;
  if (role === "operator") return <LandingStudent />;
  if (role === "viewer") return <LandingCommunity />;
  return <MyDay />;
}

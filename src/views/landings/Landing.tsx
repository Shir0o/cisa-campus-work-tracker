import React from "react";
import { useAuth } from "../../components/AuthProvider";
import MyDay from "../MyDay";
import LandingTrainee from "./LandingTrainee";

// Role-dispatched home, served at "/". Full-timers get the My Day cockpit;
// Trainees get their own landing. Unknown/approved roles fall back to My Day.
export default function Landing() {
  const { role } = useAuth();
  if (role === "manager") return <LandingTrainee />;
  return <MyDay />;
}

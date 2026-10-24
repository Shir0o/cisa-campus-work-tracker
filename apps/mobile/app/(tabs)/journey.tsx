import { Redirect } from 'expo-router';

// The Journey is no longer a phone screen: it is People narrowed by Step
// (ADR 0047). This route stays so old deep links still land somewhere.
export default function Journey() {
  return <Redirect href="/people" />;
}

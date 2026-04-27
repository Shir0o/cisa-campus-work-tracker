import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getUserAvatar(photoURL: string | null | undefined, gender?: string | null) {
  if (photoURL) return photoURL;
  
  const isFemale = gender === 'female';
  return isFemale 
    ? "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka&gender=female" 
    : "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&gender=male";
}

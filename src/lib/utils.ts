import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getUserAvatar(photoURL: string | null | undefined, gender?: string | null) {
  if (photoURL) return photoURL;
  
  const isFemale = gender === 'female';
  return isFemale 
    ? "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka&gender=female" 
    : "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&gender=male";
}

export function formatPhoneNumber(value: string) {
  if (!value) return value;
  const phoneNumber = value.replace(/[^\d]/g, '');
  const phoneNumberLength = phoneNumber.length;
  if (phoneNumberLength < 4) return phoneNumber;
  if (phoneNumberLength < 7) {
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
  }
  return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
}

export function validatePhoneNumber(value: string) {
  const digits = value.replace(/[^\d]/g, '');
  return digits.length === 10;
}

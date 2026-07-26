import { nanoid } from "nanoid";

const ADJECTIVES = [
  "Cipher",
  "Phantom",
  "Shadow",
  "Vanish",
  "Ghost",
  "Stealth",
  "Crypto",
  "Enigma",
  "Silent",
  "Obsidian",
  "Quantum",
  "Zero",
  "Covert",
  "Vector",
];

const ANIMALS = [
  "Panther",
  "Lynx",
  "Fox",
  "Owl",
  "Viper",
  "Raven",
  "Falcon",
  "Wolf",
  "Cobra",
  "Hawk",
  "Leopard",
  "Jaguar",
  "Mantid",
  "Serpent",
];

/**
 * Generate a random anonymous alias (e.g., "Cipher Lynx", "Phantom Owl")
 */
export function generateAnonymousName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj} ${animal}`;
}

/**
 * Generate a 16-character room ID
 */
export function generateRoomId(): string {
  return nanoid(16);
}

/**
 * Generate a unique 36-character message or sender ID
 */
export function generateId(): string {
  return nanoid(36);
}

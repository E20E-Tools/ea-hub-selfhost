export function keygen(): { publicKey: string; privateKey: string };
export function encryptFile(
  input: string,
  output: string,
  publicKey: string,
): Promise<void>;
export function decryptFile(
  input: string,
  output: string,
  privateKey: string,
): Promise<void>;
export function encryptDir(dir: string, publicKey: string): Promise<number>;
export function decryptDir(folder: string, privateKey: string): Promise<number>;

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const encodedSecret = process.env.OPENAI_KEY_ENCRYPTION_SECRET;
  if (!encodedSecret) {
    throw new Error("ENCRYPTION_NOT_CONFIGURED");
  }

  let secret: Uint8Array<ArrayBuffer>;
  try {
    secret = decodeBase64(encodedSecret.trim());
  } catch {
    throw new Error("ENCRYPTION_NOT_CONFIGURED");
  }

  if (secret.byteLength !== 32) {
    throw new Error("ENCRYPTION_NOT_CONFIGURED");
  }

  return crypto.subtle.importKey(
    "raw",
    secret,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptString(
  plaintext: string,
): Promise<{ ciphertextB64: string; ivB64: string }> {
  const key = await getEncryptionKey();
  const iv = new Uint8Array(new ArrayBuffer(12));
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  return {
    ciphertextB64: encodeBase64(new Uint8Array(ciphertext)),
    ivB64: encodeBase64(iv),
  };
}

export async function decryptString({
  ciphertextB64,
  ivB64,
}: {
  ciphertextB64: string;
  ivB64: string;
}): Promise<string> {
  const key = await getEncryptionKey();
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decodeBase64(ivB64) },
      key,
      decodeBase64(ciphertextB64),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("DECRYPTION_FAILED");
  }
}

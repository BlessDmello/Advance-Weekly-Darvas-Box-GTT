export function redactSecrets(_document: unknown, value: Record<string, unknown>) {
  for (const key of ['passwordHash', 'sessionTokenHash', 'tokenHash', 'initialBootstrapKey']) {
    delete value[key];
  }
  return value;
}

export const modelOptions = {
  strict: 'throw' as const,
  autoCreate: false,
  autoIndex: false,
  toJSON: { transform: redactSecrets },
  toObject: { transform: redactSecrets },
};
export const tokenHashPattern = /^[a-f\d]{64}$/;

export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;

  /** Must compare in constant time. */
  abstract verify(password: string, hash: string): Promise<boolean>;
}

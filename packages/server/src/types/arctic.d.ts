declare module "arctic" {
  export type IdTokenClaims = {
    sub: string;
  } & Record<string, unknown>;

  export interface OAuth2Tokens {
    idToken(): string | null;
  }

  export class OAuth2RequestError extends Error {}

  export class ArcticFetchError extends Error {}

  export class Google {
    constructor(clientId: string, clientSecret: string, redirectUri: string);
    createAuthorizationURL(state: string, codeVerifier: string, scopes: string[]): URL;
    validateAuthorizationCode(code: string, codeVerifier: string): Promise<OAuth2Tokens>;
  }

  export function generateState(): string;
  export function generateCodeVerifier(): string;
  export function decodeIdToken(token: string): IdTokenClaims;
}

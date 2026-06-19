/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UPLOAD_SERVICE_URL?: string;
  readonly VITE_UPLOAD_SERVICE_DID?: string;
  readonly VITE_REVOCATION_URL?: string;
  readonly VITE_REVOCATION_DID?: string;
  readonly VITE_RECEIPTS_URL?: string;
  readonly VITE_SERVICE_MANIFEST_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

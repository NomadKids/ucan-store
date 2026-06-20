import { useEffect, useState } from 'react';
import { UploadResponse } from '../types/upload';
import type { UCANDelegationService } from '../lib/ucan-delegation';

let delegationServicePromise: Promise<UCANDelegationService> | null = null;

function loadDelegationService(): Promise<UCANDelegationService> {
  if (!delegationServicePromise) {
    delegationServicePromise = import('../lib/ucan-delegation').then(
      ({ UCANDelegationService }) => new UCANDelegationService()
    );
  }
  return delegationServicePromise;
}

export function useFileUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [isDelegationServiceLoading, setIsDelegationServiceLoading] = useState(true);
  const [delegationService, setDelegationService] = useState<UCANDelegationService | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadDelegationService()
      .then((service) => {
        if (!cancelled) {
          setDelegationService(service);
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load delegation service';
        console.error('❌ Failed to load delegation service:', err);
        if (!cancelled) {
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsDelegationServiceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const uploadFile = async (file: File): Promise<UploadResponse | null> => {
    console.log('🚀 Upload started for file:', file.name, 'Size:', file.size);
    setIsUploading(true);
    setError(null);

    try {
      const service = delegationService ?? (await loadDelegationService());
      if (!delegationService) {
        setDelegationService(service);
        setIsDelegationServiceLoading(false);
      }

      // Check if setup is complete
      console.log('📋 Checking setup status...');
      const setupComplete = service.isSetupComplete();
      console.log('Setup complete:', setupComplete);
      
      if (!setupComplete) {
        const credentials = service.getStorachaCredentials();
        const delegations = service.getReceivedDelegations();
        console.log('Has credentials:', !!credentials);
        console.log('Received delegations:', delegations.length);
        throw new Error('Setup incomplete. Please import a UCAN delegation or add Storacha credentials first.');
      }

      // Initialize WebAuthn DID if needed
      console.log('🔐 Initializing WebAuthn DID...');
      await service.initializeWebAuthnDID();
      console.log('✅ WebAuthn DID initialized');

      // Upload file using browser-only Storacha client
      console.log('📤 Starting upload via delegationService.uploadFile()...');
      const result = await service.uploadFile(file);
      console.log('✅ Upload completed! CID:', result.cid);
      
      return {
        ok: true,
        cid: result.cid
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      console.error('❌ Upload failed:', message);
      console.error('Full error:', err);
      setError(message);
      return null;
    } finally {
      setIsUploading(false);
      console.log('Upload process finished');
    }
  };

  return { uploadFile, isUploading, isDelegationServiceLoading, error, delegationService };
}

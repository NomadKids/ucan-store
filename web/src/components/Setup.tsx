import { useState, useEffect } from 'react';
import { Key, Shield, Copy, Check, AlertCircle } from 'lucide-react';
import type { UCANDelegationService } from '../lib/ucan-delegation';
import { WebAuthnDIDProvider } from '../lib/webauthn-did';

interface SetupProps {
  delegationService: UCANDelegationService;
  onSetupComplete?: () => void;
  onDidCreated?: () => void;
}

export function Setup({ delegationService, onSetupComplete, onDidCreated }: SetupProps) {
  const [currentDID, setCurrentDID] = useState<string | null>(null);
  const [keyAlgorithm, setKeyAlgorithm] = useState<'Ed25519' | 'P-256' | null>(null);
  const [isNativeEd25519, setIsNativeEd25519] = useState(false);
  const [isCreatingDID, setIsCreatingDID] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [webauthnSupported, setWebauthnSupported] = useState(false);

  useEffect(() => {
    // Check WebAuthn support
    setWebauthnSupported(WebAuthnDIDProvider.isSupported());
    
    // Load existing DID and key algorithm info
    const did = delegationService.getCurrentDID();
    setCurrentDID(did);
    
    // Load WebAuthn credential info to check key type
    const credInfo = localStorage.getItem('webauthn_credential_info');
    if (credInfo) {
      try {
        const parsed = JSON.parse(credInfo);
        setKeyAlgorithm(parsed.keyAlgorithm || 'P-256');
        setIsNativeEd25519(parsed.isNativeEd25519 || false);
      } catch (e) {
        console.error('Failed to parse credential info:', e);
      }
    }
  }, [delegationService]);

  const handleCreateDID = async () => {
    setIsCreatingDID(true);
    try {
      // Simple unencrypted Ed25519 DID stored in localStorage
      await delegationService.initializeEd25519DID(false);
      
      const did = delegationService.getCurrentDID();
      setCurrentDID(did);
      
      // Load key algorithm info
      const credInfo = localStorage.getItem('webauthn_credential_info');
      if (credInfo) {
        try {
          const parsed = JSON.parse(credInfo);
          setKeyAlgorithm(parsed.keyAlgorithm || 'P-256');
          setIsNativeEd25519(parsed.isNativeEd25519 || false);
        } catch (e) {
          console.error('Failed to parse credential info:', e);
        }
      }
      
      // Notify parent that DID was created
      if (onDidCreated) {
        onDidCreated();
      }
      
      if (onSetupComplete) {
        onSetupComplete();
      }
    } catch (error) {
      alert(`Failed to create DID: ${error}`);
    } finally {
      setIsCreatingDID(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const isSetupComplete = Boolean(currentDID);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">
          Browser-Only Setup
        </h2>
        <p className="text-gray-600">
          Create a browser DID, then import a UCAN delegation issued by your self-hosted service
        </p>
      </div>

      {/* WebAuthn Support Check */}
      {!webauthnSupported && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
            <div>
              <h3 className="text-red-800 font-medium">WebAuthn Not Supported</h3>
              <p className="text-red-700 text-sm">
                Your browser doesn't support WebAuthn. Please use a modern browser like Chrome, Firefox, or Safari.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Step 1: WebAuthn DID */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center mb-4">
          <Key className="h-6 w-6 text-blue-500 mr-3" />
          <h3 className="text-xl font-semibold text-gray-900">
            Step 1: Create Ed25519 DID
          </h3>
        </div>
        
        <div className="space-y-4">
          <p className="text-gray-600">
            Generate an Ed25519 DID for UCAN delegations. The private key will be stored in your browser (no extra WebAuthn keystore encryption).
          </p>
          
          {currentDID ? (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-green-500" />
                    <div>
                      <span className="text-green-800 font-medium">
                        {keyAlgorithm === 'Ed25519' ? 'Ed25519' : 'P-256'} DID Created
                        {isNativeEd25519 && <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Hardware-Backed</span>}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(currentDID, 'did')}
                    className="flex items-center text-green-600 hover:text-green-800"
                    data-testid="copy-did-button"
                  >
                    {copiedField === 'did' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-2">
                  <code 
                    className="text-sm text-green-700 bg-green-100 px-2 py-1 rounded break-all"
                    data-testid="did-display"
                  >
                    {currentDID}
                  </code>
                </div>
              </div>
              
              {isNativeEd25519 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-xs text-yellow-800">
                    ⚠️ <strong>Experimental:</strong> Native Ed25519 WebAuthn keys cannot sign UCAN data. 
                    This key is for viewing only. To create or use delegations, please reset and use P-256.
                  </p>
                </div>
              )}
            </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={handleCreateDID}
              disabled={isCreatingDID || !webauthnSupported}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              data-testid="create-did-button"
            >
              <Key className="h-4 w-4 mr-2" />
              {isCreatingDID ? 'Generating...' : 'Create DID'}
            </button>
          </div>
        )}
        </div>
      </div>

      {/* Setup Complete */}
      {isSetupComplete && (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200 p-6">
          <div className="text-center">
            <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Setup Complete!
            </h3>
            <p className="text-gray-600 mb-4">
              You can now upload files and create UCAN delegations using WebAuthn authentication.
            </p>
            {onSetupComplete && (
              <button
                onClick={onSetupComplete}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
              >
                Continue to App
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

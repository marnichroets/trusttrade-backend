import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../utils/api';

const DEFAULT_CONFIG = {
  minimum_transaction: 500,
  maximum_transaction: 10000,
  payout_threshold: 100,
  platform_fee_percent: 2,
  currency: 'ZAR',
  currency_symbol: 'R',
  payment_methods: ['EFT', 'CARD', 'OZOW'],
  payout_release_times: ['10:00', '15:00'],
  payout_cutoff_times: ['09:00', '14:00'],
  payout_clearing_disclaimer: 'Bank clearing may take up to 2 business days depending on payment runs, weekends, and bank processing.',
};

const PlatformConfigContext = createContext({
  config: DEFAULT_CONFIG,
  loading: true,
  error: null,
});

export function PlatformConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    api.get('/platform/settings')
      .then((response) => {
        if (!active) return;
        setConfig((prev) => ({ ...prev, ...response.data }));
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => ({ config, loading, error }), [config, loading, error]);

  return (
    <PlatformConfigContext.Provider value={value}>
      {children}
    </PlatformConfigContext.Provider>
  );
}

export function usePlatformConfig() {
  return useContext(PlatformConfigContext);
}

export { DEFAULT_CONFIG as DEFAULT_PLATFORM_CONFIG };

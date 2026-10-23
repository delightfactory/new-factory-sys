import { createClient } from '@supabase/supabase-js';
import { assertHostedApiUrl, assertHostedPublicKey } from '../../platform/hosted-environment';
import { currentVerifiedCachePolicy, policyRequestHeaders } from '../../platform/pwa/verified-policy';
import { cacheReadEpoch, recordCachedRead } from '../../platform/pwa/cache-provenance';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const localApi = assertHostedApiUrl(supabaseUrl);
assertHostedPublicKey(supabaseKey);
const localFetch: typeof fetch = async (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin !== localApi.origin || url.username || url.password)
        return Promise.reject(new Error('FACTORY_EXTERNAL_NETWORK_BLOCKED'));
    const epoch = cacheReadEpoch();
    const hadVerifiedPolicy = currentVerifiedCachePolicy() !== null;
    const response = await fetch(input, { ...options, headers: policyRequestHeaders(input, options), redirect: 'error' });
    if (hadVerifiedPolicy && epoch === cacheReadEpoch()) recordCachedRead(response);
    return response;
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { fetch: localFetch, headers: { "X-Client-Info": "factory-native-compat/1" } },
});

// Bind every request to its initiating account, even if another tab signs in
// as a different user while a request is waiting for credentials or the network.
export function createCloudAdapter(authClient, createClient, config) {
  const requestClient = async id => {
    const { data: { session }, error } = await authClient.auth.getSession();
    if (error || !id || session?.user.id !== id) throw new Error('Account changed');
    const token = session.access_token;
    return createClient(config.url, config.publishableKey, { accessToken: async () => token });
  };
  const checked = result => { if (result.error) throw result.error; return result.data; };
  return {
    async read(id) {
      const bound = await requestClient(id);
      return checked(await bound.from('twesk_saves').select('payload,cloud_version,updated_at').maybeSingle().abortSignal(AbortSignal.timeout(15000)));
    },
    async write(payload, version, id) {
      const bound = await requestClient(id);
      return checked(await bound.rpc('twesk_save', { p_payload: payload, p_expected_version: version }).abortSignal(AbortSignal.timeout(15000)));
    },
  };
}

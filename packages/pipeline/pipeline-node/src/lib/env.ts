/*
<MODULE_CONTRACT>
<purpose>Retrieves the value of a specified environment variable and ensures it is defined.</purpose>
<non-goals>
  <item>Does not provide default values for missing environment variables.</item>
  <item>Does not handle environment variable type conversion.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of environment variable retrieval with error handling.</item>
</CHANGE_SUMMARY>
*/

export const getRequiredEnv = (name: string, env: NodeJS.ProcessEnv = process.env): string => {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

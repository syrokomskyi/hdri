export type AsyncValidator<TOptions> = (options: TOptions) => Promise<void>;

export const composeValidators = <TOptions>(
  ...validators: AsyncValidator<TOptions>[]
): AsyncValidator<TOptions> => {
  return async (options: TOptions) => {
    for (const validator of validators) {
      await validator(options);
    }
  };
};

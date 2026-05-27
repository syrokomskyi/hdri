export class ArtifactValidationError extends Error {
  override name = "ArtifactValidationError";

  readonly ownerStepId: string;
  readonly artifactId: string;
  readonly absolutePath: string;
  readonly displayPath: string;
  readonly reason: string;

  constructor(options: {
    ownerStepId: string;
    artifactId: string;
    absolutePath: string;
    displayPath?: string;
    reason: string;
  }) {
    super(
      [
        `Artifact validation failed: ${options.ownerStepId}:${options.artifactId}`,
        `Path: ${options.displayPath ?? options.absolutePath}`,
        `Reason: ${options.reason}`,
      ].join("\n")
    );

    this.ownerStepId = options.ownerStepId;
    this.artifactId = options.artifactId;
    this.absolutePath = options.absolutePath;
    this.displayPath = options.displayPath ?? options.absolutePath;
    this.reason = options.reason;
  }
}

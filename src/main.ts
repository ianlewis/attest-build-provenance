// import { buildSLSAProvenancePredicate } from '@actions/attest'
import * as core from '@actions/core'

import { getIDTokenClaims } from './oidc'
import type { Predicate } from './shared.types'

const SLSA_PREDICATE_V1_TYPE = 'https://slsa.dev/provenance/v1'

const GITHUB_BUILDER_ID_PREFIX = 'https://github.com/actions/runner'
const GITHUB_BUILD_TYPE =
  'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1'

const DEFAULT_ISSUER = 'https://token.actions.githubusercontent.com'

export const buildSLSAProvenancePredicate = async (
  issuer: string = DEFAULT_ISSUER
): Promise<Predicate> => {
  const serverURL = process.env.GITHUB_SERVER_URL
  const claims = await getIDTokenClaims(issuer)

  // Split just the path and ref from the workflow string.
  // owner/repo/.github/workflows/main.yml@main =>
  //   .github/workflows/main.yml, main
  const [workflowPath, workflowRef] = claims.workflow_ref
    .replace(`${claims.repository}/`, '')
    .split('@')

  return {
    type: SLSA_PREDICATE_V1_TYPE,
    params: {
      buildDefinition: {
        buildType: GITHUB_BUILD_TYPE,
        externalParameters: {
          workflow: {
            ref: workflowRef,
            repository: `${serverURL}/${claims.repository}`,
            path: workflowPath
          }
        },
        internalParameters: {
          github: {
            event_name: claims.event_name,
            repository_id: claims.repository_id,
            repository_owner_id: claims.repository_owner_id
          }
        },
        resolvedDependencies: [
          {
            uri: `git+${serverURL}/${claims.repository}@${claims.ref}`,
            digest: {
              gitCommit: claims.sha
            }
          }
        ]
      },
      runDetails: {
        builder: {
          id: `${GITHUB_BUILDER_ID_PREFIX}/${claims.runner_environment}`
        },
        metadata: {
          invocationId: `${serverURL}/${claims.repository}/actions/runs/${claims.run_id}/attempts/${claims.run_attempt}`
        }
      }
    }
  }
}

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    // Calculate subject from inputs and generate provenance
    const predicate = await buildSLSAProvenancePredicate()

    core.setOutput('predicate', predicate.params)
    core.setOutput('predicate-type', predicate.type)
  } catch (err) {
    const error = err instanceof Error ? err : new Error(`${err}`)
    // Fail the workflow run if an error occurs
    core.setFailed(error.message)
  }
}

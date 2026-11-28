# EA-Hub operator (OperatorHub / OLM)

A Helm-based operator ([operator-sdk](https://sdk.operatorframework.io/) `helm-operator`) that installs
the chart in [`deploy/helm/ea-hub`](../helm/ea-hub). Each `EAHub` resource
(`ea-hub.e20e-tools.github.io/v1alpha1`) is one Helm release; its `spec` holds the chart values.

| File | |
|---|---|
| `watches.yaml` | maps `EAHub` to the chart; `dryRunOption: server` keeps generated secrets stable |
| `Dockerfile` | operator image, built from the repository root (the chart is copied, not duplicated in git) |
| `bundle/` | OLM bundle: CSV (permissions, deployment, description), CRD, metadata |
| `bundle.Dockerfile` | bundle image for `operator-sdk run bundle` and catalogs |
| `samples/eahub.yaml` | minimal `EAHub` (also the `alm-examples` of the CSV) |

On a version tag the publish workflow builds and signs `ghcr.io/e20e-tools/ea-hub-operator:<version>`
(amd64 + arm64) and `ea-hub-operator-bundle:<version>`, and attaches the bundle stamped with the
version to the GitHub Release. CI validates the bundle (`operator-sdk bundle validate`, operatorframework
suite) and runs the operator on kind: install, no upgrade on reconciles without changes, one upgrade
per spec change, secrets kept.

**Catalog listing.** To list it in OperatorHub.io and the OpenShift console, open a pull request that
adds the released bundle as `operators/ea-hub/<version>/` to
[k8s-operatorhub/community-operators](https://github.com/k8s-operatorhub/community-operators) and
[redhat-openshift-ecosystem/community-operators-prod](https://github.com/redhat-openshift-ecosystem/community-operators-prod)
(signed-off commits, CI there runs its own checks).

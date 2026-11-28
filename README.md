# EA-Hub Helm repository

    helm repo add ea-hub https://e20e-tools.github.io/ea-hub-selfhost
    helm install ea-hub ea-hub/ea-hub -n ea-hub --create-namespace --set appUrl=https://hub.example.com --set admin.email=you@example.com

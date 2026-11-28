# The checksum/secret annotation must hash the Secret actually rendered (else every first
# upgrade after install, and the operator, restart the pods).
import hashlib, re, sys
s = open(sys.argv[1], encoding="utf-8").read()
sec = [d for d in s.split("\n---\n") if "# Source: ea-hub/templates/secret.yaml" in d][0]
body = sec.split("# Source: ea-hub/templates/secret.yaml\n", 1)[1]
ann = re.search(r"checksum/secret: (\w+)", s).group(1)
ok = any(hashlib.sha256(c.encode()).hexdigest() == ann for c in (body, body.rstrip("\n"), body + "\n", "\n" + body))
print(sys.argv[2], "checksum matches the rendered Secret:", ok)

set shell := ["bash", "-c"]
image := "oci.hack.bg/namada"
tag := `git rev-parse --abbrev-ref HEAD`

default:
  just -l
pull:
  docker image pull "{{image}}:{{tag}}"
run:
  docker run --network=host "{{image}}:{{tag}}"

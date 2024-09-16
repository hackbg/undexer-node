set shell := ["bash", "-c"]
image := "oci.hack.bg/namada"
tag := `git rev-parse --abbrev-ref HEAD`

default:
  just -l
pull:
  docker image pull "{{image}}:{{tag}}"
run:
  docker run --init --rm -i --network=host -v  "{{image}}:{{tag}}"
shell:
  docker run --init --rm -it --network=host "{{image}}:{{tag}}" --
root:
  docker run --init --rm -itu 0 --network=host "{{image}}:{{tag}}" --

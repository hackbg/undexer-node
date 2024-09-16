set shell := ["bash", "-c"]
image := "oci.hack.bg/namada"
tag := `git rev-parse --abbrev-ref HEAD`

default:
  just -l
pull:
  docker image pull "{{image}}:{{tag}}"
run:
  docker run --rm -i --network=host "{{image}}:{{tag}}"
shell:
  docker run --rm -it --network=host "{{image}}:{{tag}}" --
root:
  docker run --rm -itu 0 --network=host "{{image}}:{{tag}}" --

set shell := ["bash", "-c"]
image     := "oci.hack.bg/namada"
tag       := `git rev-parse --abbrev-ref HEAD`
config    := "--init --rm -i --network=host -v ./.state/masp-params:/home/namada/.masp-params:rw"

default:
  just -l
build:
  docker build -t "{{image}}:{{tag}}" .
pull:
  docker image pull "{{image}}:{{tag}}"
dev:
  docker run {{config}} -v ./control.js:/control.js:ro {{image}}:{{tag}}
run:
  docker run {{config}} {{image}}:{{tag}}
shell:
  docker run {{config}} -t {{image}}:{{tag}} --
root:
  docker run {{config}} -tu 0 {{image}}:{{tag}} --
deps:
  deno cache deps.js
push:
  git push -u github main
  git push -u origin main

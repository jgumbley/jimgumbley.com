# Makefile for Website and Blog

define success
	@tput setaf 2; \
	echo ""; \
	owls="🦉 🦆 🦢 🐦 🦜"; \
	n=$$(expr $$(od -An -N2 -tu2 /dev/urandom | tr -d ' ') % 5 + 1); \
	owl=$$(echo $$owls | cut -d' ' -f$$n); \
	printf "%s > \033[33m%s\033[0m completed [OK]\n" "$$owl" "$(@)"; \
	tput sgr0;
endef

.PHONY: preview clean html

# Website preview
preview:
	python3 -m http.server
	$(call success)

# Blog targets
SRCDIR=./blogsrc
OUTPUTDIR=./blog
CONFFILE=$(SRCDIR)/pelicanconf.py
PUBLISHCONF=$(SRCDIR)/publishconf.py

venv:
	python3 -m venv venv
	. venv/bin/activate && \
	pip install -r $(SRCDIR)/requirements.txt
	$(call success)

cleanblog:
	rm -rf blog/
	mkdir blog/
	$(call success)

clean: cleanblog
	rm -rf venv
	$(call success)

html: cleanblog venv
	. venv/bin/activate && \
	pelican $(SRCDIR)/content -o $(OUTPUTDIR) -s $(CONFFILE)
	$(call success)

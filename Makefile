include common.mk

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

.PHONY: preview clean clean_venv html

# Website preview
preview: html html html html
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

clean: cleanblog clean_venv

clean_venv:
	rm -rf venv

html: cleanblog venv
	. venv/bin/activate && \
	pelican $(SRCDIR)/content -o $(OUTPUTDIR) -s $(CONFFILE)
	$(call success)

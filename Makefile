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

.PHONY: preview clean cleanblog clean_venv cleanwedding html site wedding wedding-assets wedding-check venv

site: html wedding
	$(call success)

# Website preview
preview: site
	python3 -m http.server
	$(call success)

# Wedding site
wedding: venv
	venv/bin/python weddingsrc/generate.py
	$(call success)

wedding-check: wedding
	venv/bin/python weddingsrc/generate.py --check
	$(call success)

wedding-assets: venv
	venv/bin/python weddingsrc/export_assets.py
	$(call success)

# Blog targets
SRCDIR=./blogsrc
OUTPUTDIR=./blog
CONFFILE=$(SRCDIR)/pelicanconf.py
PUBLISHCONF=$(SRCDIR)/publishconf.py

venv: venv/.requirements-installed

venv/.requirements-installed: $(SRCDIR)/requirements.txt
	python3 -m venv venv
	. venv/bin/activate && \
	pip install -r $(SRCDIR)/requirements.txt
	touch $@
	$(call success)

cleanblog:
	rm -rf blog/
	mkdir blog/
	$(call success)

clean: cleanblog cleanwedding clean_venv

cleanwedding:
	rm -f wedding/index.html wedding/manifest.json wedding/wedding.css \
		wedding/assets/botanical-frame.svg wedding/assets/botanical-divider.svg \
		wedding/assets/flower-favicon.svg wedding/assets/favicon-32.png \
		wedding/assets/apple-touch-icon.png wedding/assets/social-preview.svg \
		wedding/assets/social-preview.png
	$(call success)

clean_venv:
	rm -rf venv

html: cleanblog venv
	. venv/bin/activate && \
	pelican $(SRCDIR)/content -o $(OUTPUTDIR) -s $(CONFFILE)
	$(call success)

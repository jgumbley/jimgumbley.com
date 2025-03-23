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

.PHONY: preview clean_log venv clean clean-output build serve serve-dev publish

# Website preview
preview:
	python3 -m http.server
	$(call success)

# Blog targets
SRCDIR=$(CURDIR)/blogsrc
OUTPUTDIR=$(CURDIR)/blog
CONFFILE=$(SRCDIR)/pelicanconf.py
PUBLISHCONF=$(SRCDIR)/publishconf.py

venv:
	python3 -m venv $(SRCDIR)/venv
	. $(SRCDIR)/venv/bin/activate && \
	pip install -r $(SRCDIR)/requirements.txt
	$(call success)

cleanblog:
	rm -rf blog/
	mkdir blog/
	$(call success)

clean:
	rm -rf $(SRCDIR)/venv
	$(call success)

build: venv
	. $(SRCDIR)/venv/bin/activate && \
	cd $(SRCDIR) && \
	pelican content -o $(OUTPUTDIR) -s $(CONFFILE)
	$(call success)

publish: cleanblog venv
	. $(SRCDIR)/venv/bin/activate && \
	cd $(SRCDIR) && \
	pelican content -o $(OUTPUTDIR) -s $(PUBLISHCONF)
	$(call success)

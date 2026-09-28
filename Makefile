include common.mk

# Makefile for Website and Blog

define success
	@printf '%s completed [OK]\n' '$(@)'
endef

.PHONY: preview clean clean-site cleanblog clean_venv cleanwedding html site wedding wedding-assets wedding-check site-check venv

site: clean-site
	mkdir -p _site
	cp index.html web_ss.css pics.js favicon.ico favicon.png CNAME wedding-preview.png _site/
	cp -R pics _site/pics
	$(MAKE) html wedding
	$(call success)

# Website preview
preview: site
	python3 -m http.server --directory _site
	$(call success)

# Wedding site
wedding: venv
	venv/bin/python weddingsrc/generate.py
	$(call success)

wedding-check: wedding
	node --check weddingsrc/static/wedding.js
	venv/bin/python weddingsrc/generate.py --check
	$(call success)

wedding-assets: venv
	venv/bin/python weddingsrc/export_assets.py
	$(call success)

# Blog targets
SRCDIR=./blogsrc
OUTPUTDIR=./_site/blog
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
	rm -rf _site/blog/
	$(call success)

clean: clean-site clean_venv

clean-site:
	rm -rf _site/

cleanwedding:
	rm -rf _site/wedding/
	$(call success)

clean_venv:
	rm -rf venv

html: cleanblog venv
	. venv/bin/activate && \
	pelican $(SRCDIR)/content -o $(OUTPUTDIR) -s $(CONFFILE)
	$(call success)

# Check the complete publish directory and the wedding generator's invariants.
site-check: site
	node --check pics.js
	node --check weddingsrc/static/wedding.js
	venv/bin/python weddingsrc/generate.py --check
	test -s _site/index.html
	test -s _site/blog/index.html
	test -s _site/blog/feeds/all.atom.xml
	test -s _site/blog/feeds/all.rss.xml
	cmp CNAME _site/CNAME
	test ! -e _site/blogsrc
	test ! -e _site/weddingsrc
	test ! -e _site/venv
	$(call success)

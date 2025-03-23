#!/usr/bin/env python
# -*- coding: utf-8 -*- #

AUTHOR = 'Jim Gumbley'
SITENAME = 'fragmented sentences'
SITEURL = ''

PATH = 'content'
OUTPUT_PATH = '../blog'  # Output directly to the blog directory

TIMEZONE = 'Europe/London'

DEFAULT_LANG = 'en'

# Feed generation is disabled
FEED_ALL_ATOM = None
CATEGORY_FEED_ATOM = None
TRANSLATION_FEED_ATOM = None
AUTHOR_FEED_ATOM = None
AUTHOR_FEED_RSS = None

# No blogroll or social links
LINKS = ()
SOCIAL = ()

# Disable pagination
DEFAULT_PAGINATION = False

# Use relative URLs
RELATIVE_URLS = True

# Use Markdown
MARKUP = ('md',)

# Use our minimal theme
THEME = 'themes/minimal'

# Disable unnecessary pages
DIRECT_TEMPLATES = ['index']
AUTHOR_SAVE_AS = ''
AUTHORS_SAVE_AS = ''
CATEGORY_SAVE_AS = ''
CATEGORIES_SAVE_AS = ''
TAG_SAVE_AS = ''
TAGS_SAVE_AS = ''
ARCHIVES_SAVE_AS = ''

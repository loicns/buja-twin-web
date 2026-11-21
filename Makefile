V ?= v$(shell date +%Y%m%d)
DIST = dist/$(V)
PYTHON ?= $(CURDIR)/.venv/bin/python
export PATH := $(CURDIR)/.venv/bin:$(PATH)
export PYTHON

.PHONY: dist test publish
dist:
	$(PYTHON) pipelines/package_data.py --out $(DIST)
	bash pipelines/make_tiles.sh $(DIST)
	DIST=$(DIST) $(PYTHON) -m pytest -q pipelines/tests/test_dist.py

test:
	DIST=$(DIST) $(PYTHON) -m pytest -q pipelines/tests/test_dist.py

# Needs rclone configured with a remote called r2 (Phase 1, task 9). Not run until the bucket keys exist.
publish:
	test -f $(DIST)/catalog.json
	rclone copy $(DIST) r2:buja-twin-data/$(V) --s3-no-check-bucket --progress \
	  --header-upload "Cache-Control: public, max-age=31536000, immutable"
	echo '{"current":"$(V)"}' | rclone rcat r2:buja-twin-data/current.json \
	  --header-upload "Cache-Control: no-cache"

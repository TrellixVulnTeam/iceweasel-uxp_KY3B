#! /bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

MOZ_APP_BASENAME=Iceweasel-UXP
MOZ_APP_VENDOR=Hyperbola
MOZ_PHOENIX=1
MOZ_AUSTRALIS=1
HYPE_ICEWEASEL=1
MOZ_UPDATER=0

if test "$OS_ARCH" = "WINNT" -o \
        "$OS_ARCH" = "Linux"; then
  MOZ_BUNDLED_FONTS=1
fi

if test "$OS_ARCH" = "WINNT"; then
  MOZ_MAINTENANCE_SERVICE=
fi

# For Iceweasel-UXP we want to use 52.9.YYYYMMDD as MOZ_APP_VERSION in release
# builds so add-on developers have something to target while maintaining
# Firefox compatibility.
MOZ_APP_VERSION=52.9.`date --utc '+%Y%m%d'`
MOZ_APP_VERSION_DISPLAY=52.9.`date --utc '+%Y%m%d'`

MOZ_EXTENSIONS_DEFAULT=" gio"

# MOZ_APP_DISPLAYNAME will be set by branding/configure.sh
# MOZ_BRANDING_DIRECTORY is the default branding directory used when none is
# specified. It should never point to the "official" branding directory.
MOZ_BRANDING_DIRECTORY=$MOZ_BUILD_APP/branding/iceweasel
MOZ_OFFICIAL_BRANDING_DIRECTORY=$MOZ_BUILD_APP/branding/iceweasel
MOZ_APP_ID={ec8030f7-c20a-464f-9b0e-13a3a9e97384}
# This should usually be the same as the value MAR_CHANNEL_ID.
# If more than one ID is needed, then you should use a comma separated list
# of values.
ACCEPTED_MAR_CHANNEL_IDS=iceweasel-release
# The MAR_CHANNEL_ID must not contain the following 3 characters: ",\t "
MAR_CHANNEL_ID=iceweasel-release

# Features
MOZ_PROFILE_MIGRATOR=1
MOZ_APP_STATIC_INI=1
MOZ_WEBGL_CONFORMANT=1
MOZ_JSDOWNLOADS=1
MOZ_WEBRTC=
MOZ_DEVTOOLS=1
MOZ_SERVICES_COMMON=1
MOZ_SERVICES_SYNC=1
MOZ_SERVICES_HEALTHREPORT=
MOZ_SAFE_BROWSING=

# Disable checking that add-ons are signed by the trusted root
MOZ_ADDON_SIGNING=
MOZ_REQUIRE_SIGNING=

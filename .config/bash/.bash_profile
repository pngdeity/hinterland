#
# ~/.bash_profile
#
# Notes
## This file is only sourced by login shells.
## See the Arch Wiki article on Bash, subheading Invocation.

# Implement user directories for the XDG Base Directory Specification
export XDG_CONFIG_HOME=$HOME/.config
export XDG_CACHE_HOME=$HOME/.cache
export XDG_DATA_HOME=$HOME/.local/share
export XDG_STATE_HOME=$HOME/.local/state

# Manual application intervention for XDG Base Directory Specification compliance
## The ordering of entries roughly correlates to installation time of the related program.
## See the Arch Wiki article XDG Base Directory, subheading Support.
## Note that some applications do eventually become compliant, but the article may not be updated.
export XAUTHORITY="$XDG_RUNTIME_DIR"/Xauthority
export XINITRC="$XDG_CONFIG_HOME"/X11/xinitrc
## This config file is not currently in use, hence the comment. The system-wide file is in /etc/X11/xinit
# export XSERVERRC="$XDG_CONFIG_HOME"/X11/xserverrc
export DOCKER_CONFIG=$XDG_CONFIG_HOME/docker 
export CARGO_HOME=$XDG_DATA_HOME/cargo
export RUSTUP_HOME=$XDG_DATA_HOME/rustup
export ELECTRUMDIR=$XDG_DATA_HOME/electrum
export NPM_CONFIG_USERCONFIG=$XDG_CONFIG_HOME/npm/npmrc 
export NUGET_PACKAGES=$XDG_CACHE_HOME/NuGetPackages
export _JAVA_OPTIONS=-Djava.util.prefs.userRoot="$XDG_CONFIG_HOME"/java
export W3M_DIR="$XDG_STATE_HOME/w3m"

# Default programs
export EDITOR=/usr/bin/nvim
export BROWSER=/usr/bin/firefox-beta

# For user software that is installed manually 
export PATH=$PATH:$HOME/.local/bin

# Support non-default diff editor when using pacdiff
export DIFFPROG="${EDITOR:vimdiff} pacdiff"

# Required when starting ssh-agent as a user unit
# See https://wiki.archlinux.org/title/SSH_keys#Start_ssh-agent_with_systemd_user
export SSH_AUTH_SOCK=$XDG_RUNTIME_DIR/ssh-agent.socket

# Stop ranger (text-based file manager) from loading both the default and your user (modified) rc.conf 
export RANGER_LOAD_DEFAULT_RC=FALSE

# Legacy interventions for XDG Base Directory Specification compliance
## Listings may be duplicates or conflicts for entries found earlier in this document.
## The software to which the environment change applies may also not be installed.
## Before uncommenting any lines, validation of outcome(s) should be employed for system stability.
## See also $HOME/.bashrc for other (commented) cruft-y configurations
# Why is GTK2 needed?
# export GTK2_RC_FILES="$XDG_CONFIG_HOME"/gtk-2.0/gtkrc
# export VIMINIT='let $MYVIMRC="$XDG_CONFIG_HOME/vim/vimrc" | source $MYVIMRC'
# Vim environment variables
# export MYVIMRC="/home/nathan/.config/nvim/init.vim"

if [ -z "${DISPLAY}" ] && [ "${XDG_VTNR}" -eq 1 ]; then
  exec startx
fi

# This silences startx messages on bootup, stopping pollution in the login tty
# [[ $(fgconsole 2>/dev/null) == 1 ]] && exec startx -- vt1 &> /dev/null

[[ -f ~/.bashrc ]] && . ~/.bashrc

## [Completion]
## Completion scripts setup. Remove the following line to uninstall
[ -f /home/nathan/.config/.dart-cli-completion/bash-config.bash ] && . /home/nathan/.config/.dart-cli-completion/bash-config.bash || true
## [/Completion]


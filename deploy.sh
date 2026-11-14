#!/bin/bash
ANSIBLE_CONFIG=./ansible.cfg ansible-playbook deploy.yml --ask-vault-pass "$@"
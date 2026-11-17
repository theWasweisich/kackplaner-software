#!/bin/bash
ANSIBLE_CONFIG=./ansible.cfg ansible-playbook deploy.yml --vault-password-file ~/.kackplaner_vault.pass "$@"
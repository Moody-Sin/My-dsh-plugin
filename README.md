# My-dsh-plugin

[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

> DeepSeek Harness (DSH) 个人/团队定制化插件合集仓库。

## 目录

- [背景](#背景)
- [插件列表](#插件列表)
- [开发指南](#开发指南)
- [维护日志](#维护日志)
- [维护者](#维护者)
- [使用许可](#使用许可)

## 背景

本仓库用于管理和维护 DeepSeek Harness 的本地与独立分发插件。主仓库目录下每个插件分配一个独立目录，提供完整的生命周期管理、测试套件与使用文档。

## 插件列表

| 插件名称 | 目录 | 版本 | 简介 |
| :--- | :--- | :--- | :--- |
| **`@local/dsh-plugin-notifier`** | [`dsh-plugin-notifier/`](./dsh-plugin-notifier) | `v0.2.0` | 跨平台系统原生桌面弹窗、提示音及飞书/钉钉/企微/Bark/通用 Webhook 离机通知插件。 |

## 开发指南

- 遵循 [约定式提交 (Conventional Commits)](https://www.conventionalcommits.org/zh-hans/)。
- 遵循 [语义化版本 (SemVer)](https://semver.org/lang/zh-CN/)。
- 每个插件目录需配备完整的 `README.md`、`CHANGELOG.md`、单元测试及 DSH 元数据。

## 维护日志

详见 [CHANGELOG.md](./CHANGELOG.md)。

## 维护者

[@DeepSeek-Harness-User](https://github.com)

## 使用许可

[MIT](./LICENSE)

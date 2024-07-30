<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
  <div v-if="meta" class="rsqzvsbo">
	<MkFeaturedPhotos class="bg" />
	<div class="shape1"></div>
	<div class="shape2"></div>
	<div class="logo-wrapper">
	  <div class="powered-by">Powered by</div>
	  <img :src="misskeysvg" class="misskey" />
	</div>
	<div class="emojis">
	  <MkEmoji :normal="true" :noStyle="true" emoji="👍" />
	  <MkEmoji :normal="true" :noStyle="true" emoji="❤" />
	  <MkEmoji :normal="true" :noStyle="true" emoji="�" />
	  <MkEmoji :normal="true" :noStyle="true" emoji="🎉" />
	  <MkEmoji :normal="true" :noStyle="true" emoji="🍮" />
	</div>
	<div class="contents">
	  <MkVisitorDashboard />
	</div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkFeaturedPhotos from '@/components/MkFeaturedPhotos.vue';
import misskeysvg from '/client-assets/misskey.svg';
import MkVisitorDashboard from '@/components/MkVisitorDashboard.vue';
</script>

<style lang="scss" scoped>
.rsqzvsbo {
  > .bg {
	position: fixed;
	top: 0;
	right: 0;
	width: 80vw;
	height: 100vh;
  }

  > .shape1 {
	position: fixed;
	top: 0;
	left: 0;
	width: 100vw;
	height: 100vh;
	background: var(--accent);
	clip-path: polygon(0% 0%, 45% 0%, 20% 100%, 0% 100%);
  }

  > .shape2 {
	position: fixed;
	top: 0;
	left: 0;
	width: 100vw;
	height: 100vh;
	background: var(--accent);
	clip-path: polygon(0% 0%, 25% 0%, 35% 100%, 0% 100%);
	opacity: 0.5;
  }

  > .logo-wrapper {
	position: fixed;
	top: 36px;
	left: 36px;
	flex: auto;
	color: #fff;
	user-select: none;
	pointer-events: none;

	> .powered-by {
	  margin-bottom: 2px;
	}

	> .misskey {
	  width: 140px;

	  @media (max-width: 450px) {
		width: 130px;
	  }
	}
  }

  > .emojis {
	position: fixed;
	bottom: 32px;
	left: 35px;

	> * {
	  margin-right: 8px;
	}

	@media (max-width: 1200px) {
	  display: none;
	}
  }

  > .contents {
	position: relative;
	width: min(430px, calc(100% - 32px));
	margin-left: 128px;
	padding: 100px 0 100px 0;

	@media (max-width: 1200px) {
	  margin: auto;
	}
  }

  > .federation {
	position: fixed;
	bottom: 16px;
	left: 0;
	right: 0;
	margin: auto;
	background: var(--acrylicPanel);
	-webkit-backdrop-filter: var(--blur, blur(15px));
	backdrop-filter: var(--blur, blur(15px));
	border-radius: 999px;
	overflow: clip;
	width: 800px;
	padding: 8px 0;

	@media (max-width: 900px) {
	  display: none;
	}
  }
}
</style>

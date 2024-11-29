<template>
<div class="snowfrakes">
	<div class="snowfrake"></div>
	<div class="snowfrake"></div>
	<div class="snowfrake"></div>
</div>
</template>

	<style lang="scss" scoped>
	.snowfrakes {
		--snowfrake-size-base: min(2vw, 10px);
		--snowfrake-color: #dde4eb;
		position: fixed;
		inset: 0;
		z-index: 10000;
		pointer-events: none;
	}

	.snowfrake{
		position: absolute;
		top: -5%;
		width: var(--snowfrake-size, var(--snowfrake-size-base));
		aspect-ratio: 1 / 1;
		border-radius: 50%;
		background-color: var(--snowfrake-color, snow);
		box-shadow:
			1vw   -100px 2px var(--snowfrake-color, snow),
			12vw  -290px 1px var(--snowfrake-color, snow),
			20vw  -500px 4px var(--snowfrake-color, snow),
			46vw  -110px 8px var(--snowfrake-color, snow),
			30vw  -580px 1px var(--snowfrake-color, snow),
			39vw  -250px 2px var(--snowfrake-color, snow),
			55vw  -340px 5px var(--snowfrake-color, snow),
			51vw  -150px 2px var(--snowfrake-color, snow),
			23vw  -180px 0 var(--snowfrake-color, snow),
			78vw  -220px 4px var(--snowfrake-color, snow),
			86vw  -320px 9px var(--snowfrake-color, snow),
			94vw  -170px 7px var(--snowfrake-color, snow);
		-webkit-animation-delay: 1s;
		animation-delay: 1s;
		animation: roll var(--snowfrake-duration, 5s) linear infinite;

		&:nth-child(1){
			--snowfrake-size: calc(var(--snowfrake-size-base) * 0.6);
			--snowfrake-duration: 8s;
		}

		&:nth-child(2){
			--snowfrake-size: calc(var(--snowfrake-size-base) * 1);
			--snowfrake-duration: 5s;
		}

		&:nth-child(3){
			--snowfrake-size: calc(var(--snowfrake-size-base) * 0.3);
			--snowfrake-duration: 4s;
		}
	}

	@keyframes roll {
		0% {
			left: 0;
		}
		50% {
			left: 2vw;
		}
		90% {
			opacity: 1;
		}
		100% {
			top: 100%;
			opacity: 0;
			left: -2vw;
		}
	}
	</style>

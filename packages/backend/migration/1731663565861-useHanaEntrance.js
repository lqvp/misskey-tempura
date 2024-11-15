export class UseHanaEntrance1731663565861 {
	name = 'UseHanaEntrance1731663565861'

	async up(queryRunner) {
			await queryRunner.query(`ALTER TABLE "meta" ADD "useHanaEntrance" boolean NOT NULL DEFAULT false`);
	}

	async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "useHanaEntrance"`);
	}
}

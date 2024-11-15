export class HanaThemeColors1731664908710 {
	name = 'HanaThemeColors1731664908710'

	async up(queryRunner) {
			await queryRunner.query(`ALTER TABLE "meta" ADD "hanaThemeColor" character varying(32) NOT NULL DEFAULT '#fd709a'`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "hanaThemeAltColor" character varying(32) NOT NULL DEFAULT '#f77062'`);
			await queryRunner.query(`ALTER TABLE "meta" ADD "hanaThemeWeakOpacity" float NOT NULL DEFAULT 0.2`);
	}

	async down(queryRunner) {
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "hanaThemeWeakOpacity"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "hanaThemeAltColor"`);
			await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "hanaThemeColor"`);
	}
}

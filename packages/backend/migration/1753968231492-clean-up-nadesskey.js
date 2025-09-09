/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CleanUpNadesskey1753968231492 {
    name = 'CleanUpNadesskey1753968231492'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TYPE "public"."poll_notevisibility_enum" RENAME TO "poll_notevisibility_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."poll_notevisibility_enum" AS ENUM('public', 'home', 'followers', 'specified', 'public_non_ltl' )`);
        await queryRunner.query(`ALTER TABLE "poll" ALTER COLUMN "noteVisibility" TYPE "public"."poll_notevisibility_enum" USING "noteVisibility"::"text"::"public"."poll_notevisibility_enum"`);
        await queryRunner.query(`DROP TYPE "public"."poll_notevisibility_enum_old"`);
    }

    async down(queryRunner) {
        await queryRunner.query(`CREATE TYPE "public"."poll_notevisibility_enum_old" AS ENUM('public', 'home', 'followers', 'specified' )`);
        await queryRunner.query(`ALTER TABLE "poll" ALTER COLUMN "noteVisibility" TYPE "public"."poll_notevisibility_enum_old" USING "noteVisibility"::"text"::"public"."poll_notevisibility_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."poll_notevisibility_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."poll_notevisibility_enum_old" RENAME TO "poll_notevisibility_enum"`);
    }
}

export class RevertBlockMentionsFromUnfamiliarRemoteUsers1709309505794 {
    name = 'RevertBlockMentionsFromUnfamiliarRemoteUsers1709309505794'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "blockMentionsFromUnfamiliarRemoteUsers"`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "blockMentionsFromUnfamiliarRemoteUsers" boolean NOT NULL DEFAULT true`);
    }
}

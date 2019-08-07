import { neo4jgraphql } from 'neo4j-graphql-js'
import fileUpload from './fileUpload'
import { neode } from '../../bootstrap/neo4j'
import { UserInputError } from 'apollo-server'
import Resolver from './helpers/Resolver'

const instance = neode()

export default {
  Query: {
    blockedUsers: async (object, args, context, resolveInfo) => {
      try {
        const userModel = instance.model('User')
        let blockedUsers = instance
          .query()
          .match('user', userModel)
          .where('user.id', context.user.id)
          .relationship(userModel.relationships().get('blocked'))
          .to('blocked', userModel)
          .return('blocked')
        blockedUsers = await blockedUsers.execute()
        blockedUsers = blockedUsers.records.map(r => r.get('blocked').properties)
        return blockedUsers
      } catch (e) {
        throw new UserInputError(e.message)
      }
    },
    User: async (object, args, context, resolveInfo) => {
      const { email } = args
      if (email) {
        const e = await instance.first('EmailAddress', { email })
        let user = e.get('belongsTo')
        user = await user.toJson()
        return [user.node]
      }
      return neo4jgraphql(object, args, context, resolveInfo, false)
    },
  },
  Mutation: {
    block: async (object, args, context, resolveInfo) => {
      if (context.user.id === args.id) return null
      const [user, blockedUser] = await Promise.all([
        instance.find('User', context.user.id),
        instance.find('User', args.id),
      ])
      await user.relateTo(blockedUser, 'blocked')
      return blockedUser.toJson()
    },
    unblock: async (object, args, context, resolveInfo) => {
      const { user: currentUser } = context
      if (currentUser.id === args.id) return null
      await instance.cypher(
        `
      MATCH(u:User {id: $currentUser.id})-[r:BLOCKED]->(b:User {id: $args.id})
      DELETE r
      `,
        { currentUser, args },
      )
      const blockedUser = await instance.find('User', args.id)
      return blockedUser.toJson()
    },
    UpdateUser: async (object, args, context, resolveInfo) => {
      args = await fileUpload(args, { file: 'avatarUpload', url: 'avatar' })
      try {
        const user = await instance.find('User', args.id)
        if (!user) return null
        await user.update(args)
        return user.toJson()
      } catch (e) {
        throw new UserInputError(e.message)
      }
    },
    DeleteUser: async (object, params, context, resolveInfo) => {
      const { resource } = params
      const session = context.driver.session()

      if (resource && resource.length) {
        await Promise.all(
          resource.map(async node => {
            await session.run(
              `
            MATCH (resource:${node})<-[:WROTE]-(author:User {id: $userId})
            SET resource.deleted = true
            RETURN author`,
              {
                userId: context.user.id,
              },
            )
          }),
        )
        session.close()
      }
      return neo4jgraphql(object, params, context, resolveInfo, false)
    },
  },
  User: {
    email: async (parent, params, context, resolveInfo) => {
      if (typeof parent.email !== 'undefined') return parent.email
      const { id } = parent
      const statement = `MATCH(u:User {id: {id}})-[:PRIMARY_EMAIL]->(e:EmailAddress) RETURN e`
      const result = await instance.cypher(statement, { id })
      const [{ email }] = result.records.map(r => r.get('e').properties)
      return email
    },
    isBlocked: async (parent, params, context, resolveInfo) => {
      if (typeof parent.isBlocked !== 'undefined') return parent.isBlocked
      const result = await instance.cypher(
        `
      MATCH (u:User { id: $currentUser.id })-[:BLOCKED]->(b:User {id: $parent.id})
      RETURN COUNT(u) >= 1 as isBlocked
      `,
        { parent, currentUser: context.user },
      )
      const [record] = result.records
      return record.get('isBlocked')
    },
    ...Resolver('User', {
      undefinedToNull: [
        'actorId',
        'avatar',
        'coverImg',
        'deleted',
        'disabled',
        'locationName',
        'about',
      ],
      count: {
        contributionsCount: '-[:WROTE]->(related:Post)',
        friendsCount: '<-[:FRIENDS]->(related:User)',
        followingCount: '-[:FOLLOWS]->(related:User)',
        followedByCount: '<-[:FOLLOWS]-(related:User)',
        commentsCount: '-[:WROTE]->(r:Comment)',
        commentedCount: '-[:WROTE]->(:Comment)-[:COMMENTS]->(related:Post)',
        shoutedCount: '-[:SHOUTED]->(related:Post)',
        badgesCount: '<-[:REWARDED]-(related:Badge)',
      },
      hasOne: {
        invitedBy: '<-[:INVITED]-(related:User)',
        disabledBy: '<-[:DISABLED]-(related:User)',
      },
      hasMany: {
        followedBy: '<-[:FOLLOWS]-(related:User)',
        following: '-[:FOLLOWS]->(related:User)',
        friends: '-[:FRIENDS]-(related:User)',
        socialMedia: '-[:OWNED_BY]->(related:SocialMedia',
        contributions: '-[:WROTE]->(related:Post)',
        comments: '-[:WROTE]->(related:Comment)',
        shouted: '-[:SHOUTED]->(related:Post)',
        organizationsCreated: '-[:CREATED_ORGA]->(related:Organization)',
        organizationsOwned: '-[:OWNING_ORGA]->(related:Organization)',
        categories: '-[:CATEGORIZED]->(related:Category)',
        badges: '<-[:REWARDED]-(related:Badge)',
      },
    }),
  },
}

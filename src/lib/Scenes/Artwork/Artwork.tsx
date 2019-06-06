import { Flex, Join, Spacer, Theme } from "@artsy/palette"
import { Artwork_artwork } from "__generated__/Artwork_artwork.graphql"
import { ArtworkQuery } from "__generated__/ArtworkQuery.graphql"
import Separator from "lib/Components/Separator"
import { defaultEnvironment } from "lib/relay/createEnvironment"
import renderWithLoadProgress from "lib/utils/renderWithLoadProgress"
import React from "react"
import { Dimensions, ScrollView } from "react-native"
import { createFragmentContainer, graphql, QueryRenderer } from "react-relay"
import { AboutArtistFragmentContainer as AboutArtist } from "./Components/AboutArtist"
import { ArtworkActionsFragmentContainer as ArtworkActions } from "./Components/ArtworkActions"
import { ArtworkAvailabilityFragmentContainer as ArtworkAvailability } from "./Components/ArtworkAvailability"
import { ArtworkTombstoneFragmentContainer as ArtworkTombstone } from "./Components/ArtworkTombstone"
import { ImageCarouselFragmentContainer as ImageCarousel } from "./Components/ImageCarousel/ImageCarousel"
import { OtherWorksFragmentContainer as OtherWorks } from "./Components/OtherWorks"
import { SellerInfoFragmentContainer as SellerInfo } from "./Components/SellerInfo"

interface Props {
  artwork: Artwork_artwork
}

export class Artwork extends React.Component<Props> {
  render() {
    const { artwork } = this.props
    return (
      <Theme>
        <ScrollView>
          <ImageCarousel images={artwork.images} />
          <Flex alignItems="center" mt={2}>
            <ArtworkActions artwork={artwork} />
            <ArtworkTombstone artwork={artwork} />
          </Flex>
          <Separator />
          <Join separator={<Spacer my={2} />}>
            <AboutArtist artwork={artwork} />
            <ArtworkAvailability artwork={artwork} />
            <SellerInfo artwork={artwork} />
            <OtherWorks artwork={artwork} />
          </Join>
        </ScrollView>
      </Theme>
    )
  }
}

export const ArtworkContainer = createFragmentContainer(Artwork, {
  artwork: graphql`
    fragment Artwork_artwork on Artwork {
      images {
        ...ImageCarousel_images
      }
      ...ArtworkTombstone_artwork
      ...ArtworkActions_artwork
      ...ArtworkAvailability_artwork
      ...SellerInfo_artwork
      ...OtherWorks_artwork
      ...AboutArtist_artwork
    }
  `,
})

export const ArtworkRenderer: React.SFC<{ artworkID: string }> = ({ artworkID }) => {
  return (
    <QueryRenderer<ArtworkQuery>
      environment={defaultEnvironment}
      query={graphql`
        query ArtworkQuery($artworkID: String!, $excludeArtworkIds: [String!], $screenWidth: Int!) {
          artwork(id: $artworkID) {
            ...Artwork_artwork
          }
        }
      `}
      variables={{
        artworkID,
        screenWidth: Dimensions.get("screen").width,
        excludeArtworkIds: [artworkID],
      }}
      render={renderWithLoadProgress(ArtworkContainer)}
    />
  )
}
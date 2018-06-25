import React from "react"
import { NativeModules, NavigatorIOS, View, ViewProperties } from "react-native"
import { commitMutation, createRefetchContainer, graphql, RelayRefetchProp } from "react-relay"
import styled from "styled-components/native"
import stripe from "tipsi-stripe"

import SwitchBoard from "lib/NativeModules/SwitchBoard"
import { metaphysics } from "../../../metaphysics"
import { Schema, screenTrack, track } from "../../../utils/track"

import { Flex } from "../Elements/Flex"
import { Serif14, SerifItalic14, SerifSemibold14, SerifSemibold18 } from "../Elements/Typography"

import { BiddingThemeProvider } from "../Components/BiddingThemeProvider"
import { BidInfoRow } from "../Components/BidInfoRow"
import { Button } from "../Components/Button"
import { Checkbox } from "../Components/Checkbox"
import { Container } from "../Components/Containers"
import { Divider } from "../Components/Divider"
import { Timer } from "../Components/Timer"
import { Title } from "../Components/Title"
import { Address, Bid, BidderPositionResult, PaymentCardTextFieldParams, StripeToken } from "../types"

import { BidResultScreen } from "./BidResult"
import { BillingAddress } from "./BillingAddress"
import { CreditCardForm } from "./CreditCardForm"

import { ConfirmBid_me } from "__generated__/ConfirmBid_me.graphql"
import { ConfirmBid_sale_artwork } from "__generated__/ConfirmBid_sale_artwork.graphql"

const Emission = NativeModules.Emission || {}

stripe.setOptions({ publishableKey: Emission.stripePublishableKey })

export interface ConfirmBidProps extends ViewProperties {
  sale_artwork: ConfirmBid_sale_artwork
  me: ConfirmBid_me
  bid: Bid
  relay?: RelayRefetchProp
  navigator?: NavigatorIOS
  refreshSaleArtwork?: () => void
}

interface ConfirmBidState {
  billingAddress?: Address
  creditCardFormParams?: PaymentCardTextFieldParams
  creditCardToken?: StripeToken
  conditionsOfSaleChecked: boolean
  isLoading: boolean
  requiresCheckbox: boolean
  requiresPaymentInformation: boolean
}

const MAX_POLL_ATTEMPTS = 20

const creditCardMutation = graphql`
  mutation ConfirmBidCreateCreditCardMutation($input: CreditCardInput!) {
    createCreditCard(input: $input) {
      credit_card {
        id
        brand
        name
        last_digits
        expiration_month
        expiration_year
      }
    }
  }
`

const bidderPositionMutation = graphql`
  mutation ConfirmBidCreateBidderPositionMutation($input: BidderPositionInput!) {
    createBidderPosition(input: $input) {
      result {
        status
        message_header
        message_description_md
        position {
          id
          suggested_next_bid {
            cents
            display
          }
        }
      }
    }
  }
`

const queryForBidPosition = (bidderPositionID: string) => {
  return metaphysics({
    query: `
      {
        me {
          bidder_position(id: "${bidderPositionID}") {
            status
            message_header
            message_description_md
            position {
              id
              suggested_next_bid {
                cents
                display
              }
            }
          }
        }
      }
    `,
  })
}

@screenTrack({
  context_screen: Schema.PageNames.BidFlowConfirmBidPage,
  context_screen_owner_type: null,
})
export class ConfirmBid extends React.Component<ConfirmBidProps, ConfirmBidState> {
  private pollCount = 0

  constructor(props) {
    super(props)

    const { bidders, has_qualified_credit_cards } = this.props.me
    const { requiresCheckbox, requiresPaymentInformation } = this.determineDisplayRequirements(
      bidders,
      has_qualified_credit_cards
    )

    this.state = {
      billingAddress: null,
      creditCardToken: null,
      creditCardFormParams: null,
      conditionsOfSaleChecked: false,
      isLoading: false,
      requiresCheckbox,
      requiresPaymentInformation,
    }
  }

  canPlaceBid() {
    const { billingAddress, creditCardToken, conditionsOfSaleChecked } = this.state

    if (this.state.requiresPaymentInformation) {
      return billingAddress && creditCardToken && conditionsOfSaleChecked
    } else if (this.state.requiresCheckbox) {
      return conditionsOfSaleChecked
    } else {
      return true
    }
  }

  @track({
    action_type: Schema.ActionTypes.Tap,
    action_name: Schema.ActionNames.BidFlowPlaceBid,
  })
  placeBid() {
    this.setState({ isLoading: true })

    this.state.requiresPaymentInformation ? this.createCreditCardAndBidderPosition() : this.createBidderPosition()
  }

  async createCreditCardAndBidderPosition() {
    const { billingAddress, creditCardFormParams } = this.state
    const token = await stripe.createTokenWithCard({
      ...creditCardFormParams,
      name: billingAddress.fullName,
      addressLine1: billingAddress.addressLine1,
      addressLine2: null,
      addressCity: billingAddress.city,
      addressState: billingAddress.state,
      addressZip: billingAddress.postalCode,
    })

    commitMutation(this.props.relay.environment, {
      onCompleted: () => this.createBidderPosition(),
      onError: errors => console.error("An error occurred in creditCardMutation: ", errors),
      mutation: creditCardMutation,
      variables: {
        input: {
          token: token.tokenId,
        },
      },
    })
  }

  createBidderPosition() {
    commitMutation(this.props.relay.environment, {
      onCompleted: (results, errors) => this.verifyBidPosition(results, errors),
      onError: errors => console.error("An error occurred in createBidderPosition: ", errors),
      mutation: bidderPositionMutation,
      variables: {
        input: {
          sale_id: this.props.sale_artwork.sale.id,
          artwork_id: this.props.sale_artwork.artwork.id,
          max_bid_amount_cents: this.props.bid.cents,
        },
      },
    })
  }

  verifyBidPosition(results, errors) {
    const { result } = results.createBidderPosition

    if (!errors && result.status === "SUCCESS") {
      this.bidPlacedSuccessfully(result.position.id)
    } else {
      this.presentBidResult(result)
    }
  }

  @track({
    action_type: Schema.ActionTypes.Success,
    action_name: Schema.ActionNames.BidFlowPlaceBid,
  })
  bidPlacedSuccessfully(positionId) {
    queryForBidPosition(positionId).then(this.checkBidPosition.bind(this))
  }

  checkBidPosition(result) {
    const { bidder_position } = result.data.me

    if (bidder_position.status === "PENDING" && this.pollCount < MAX_POLL_ATTEMPTS) {
      // initiating new request here (vs setInterval) to make sure we wait for the previous call to return before making a new one
      setTimeout(() => queryForBidPosition(bidder_position.position.id).then(this.checkBidPosition.bind(this)), 1000)

      this.pollCount += 1
    } else {
      this.presentBidResult(bidder_position)
    }
  }

  onConditionsOfSaleCheckboxPressed() {
    this.setState({ conditionsOfSaleChecked: !this.state.conditionsOfSaleChecked })
  }

  onConditionsOfSaleLinkPressed() {
    SwitchBoard.presentModalViewController(this, "/conditions-of-sale?present_modally=true")
  }

  refreshBidderInfo = () => {
    this.props.relay.refetch(
      { saleID: this.props.sale_artwork.sale.id },
      null,
      error => {
        if (error) {
          console.error("ConfirmBid.tsx", error.message)
        }
        const { bidders, has_qualified_credit_cards } = this.props.me
        const { requiresCheckbox, requiresPaymentInformation } = this.determineDisplayRequirements(
          bidders,
          has_qualified_credit_cards
        )
        this.setState({ requiresCheckbox, requiresPaymentInformation })
      },
      { force: true }
    )
  }

  onCreditCardAdded(token: StripeToken, params: PaymentCardTextFieldParams) {
    this.setState({ creditCardToken: token, creditCardFormParams: params })
  }

  onBillingAddressAdded(values: Address) {
    this.setState({ billingAddress: values })
  }

  goBackToSelectMaxBid() {
    this.props.navigator.pop()
  }

  presentBidResult(bidderPositionResult: BidderPositionResult) {
    if (this.props.refreshSaleArtwork) {
      this.props.refreshSaleArtwork()
    }
    NativeModules.ARNotificationsManager.postNotificationName("ARAuctionArtworkBidUpdated", {
      ARAuctionID: this.props.sale_artwork.sale.id,
      ARAuctionArtworkID: this.props.sale_artwork.artwork.id,
    })
    NativeModules.ARNotificationsManager.postNotificationName("ARAuctionArtworkRegistrationUpdatedNotification", {
      ARAuctionID: this.props.sale_artwork.sale.id,
    })

    this.props.navigator.push({
      component: BidResultScreen,
      title: "",
      passProps: {
        sale_artwork: this.props.sale_artwork,
        bidderPositionResult,
        refreshBidderInfo: this.refreshBidderInfo,
        refreshSaleArtwork: this.props.refreshSaleArtwork,
      },
    })

    this.setState({ isLoading: false })
  }

  presentCreditCardForm() {
    this.props.navigator.push({
      component: CreditCardForm,
      title: "",
      passProps: {
        onSubmit: (token, params) => this.onCreditCardAdded(token, params),
        navigator: this.props.navigator,
      },
    })
  }

  presentBillingAddressForm() {
    this.props.navigator.push({
      component: BillingAddress,
      title: "",
      passProps: {
        onSubmit: address => this.onBillingAddressAdded(address),
        billingAddress: this.state.billingAddress,
        navigator: this.props.navigator,
      },
    })
  }

  render() {
    const { artwork, lot_label, sale } = this.props.sale_artwork
    const { billingAddress, creditCardToken: token, requiresPaymentInformation, requiresCheckbox } = this.state

    return (
      <BiddingThemeProvider>
        <Container m={0}>
          <Flex alignItems="center">
            <Title mb={3}>Confirm your bid</Title>
            <Timer liveStartsAt={sale.live_start_at} endsAt={sale.end_at} />
          </Flex>

          <View>
            <Flex m={4} mt={0} alignItems="center">
              <SerifSemibold18>{artwork.artist_names}</SerifSemibold18>
              <SerifSemibold14>Lot {lot_label}</SerifSemibold14>

              <SerifItalic14 color="black60" textAlign="center">
                {artwork.title}, <Serif14>{artwork.date}</Serif14>
              </SerifItalic14>
            </Flex>

            <Divider mb={2} />

            <BidInfoRow label="Max bid" value={this.props.bid.display} onPress={() => this.goBackToSelectMaxBid()} />

            {requiresPaymentInformation ? (
              <View>
                <Divider mb={2} />
                <BidInfoRow
                  label="Credit Card"
                  value={token && this.formatCard(token)}
                  onPress={() => this.presentCreditCardForm()}
                />
                <Divider mb={2} />
                <BidInfoRow
                  label="Billing address"
                  value={billingAddress && this.formatAddress(billingAddress)}
                  onPress={() => this.presentBillingAddressForm()}
                />
                <Divider mb={2} />
              </View>
            ) : (
              <Divider mb={9} />
            )}
          </View>

          <View>
            {requiresCheckbox ? (
              <Checkbox justifyContent="center" onPress={() => this.onConditionsOfSaleCheckboxPressed()}>
                <Serif14 mt={2} color="black60">
                  You agree to{" "}
                  <LinkText onPress={() => this.onConditionsOfSaleLinkPressed()}>Conditions of Sale</LinkText>
                  .
                </Serif14>
              </Checkbox>
            ) : (
              <Flex alignItems="center">
                <Serif14 mt={2} color="black60">
                  You agree to{" "}
                  <LinkText onPress={() => this.onConditionsOfSaleLinkPressed()}>Conditions of Sale</LinkText>
                  .
                </Serif14>
              </Flex>
            )}

            <Flex m={4}>
              <Button
                text="Place Bid"
                inProgress={this.state.isLoading}
                selected={this.state.isLoading}
                onPress={this.canPlaceBid() ? () => this.placeBid() : null}
              />
            </Flex>
          </View>
        </Container>
      </BiddingThemeProvider>
    )
  }

  private formatCard(token: StripeToken) {
    return `${token.card.brand} •••• ${token.card.last4}`
  }

  private formatAddress(address: Address) {
    return [address.addressLine1, address.addressLine2, address.city, address.state].filter(el => el).join(" ")
  }

  private determineDisplayRequirements(bidders: ReadonlyArray<any>, hasQualifiedCreditCards: boolean) {
    const isRegistered = bidders && bidders.length > 0
    const requiresCheckbox = !isRegistered
    const requiresPaymentInformation = !(isRegistered || hasQualifiedCreditCards)
    return { requiresCheckbox, requiresPaymentInformation }
  }
}

const LinkText = styled.Text`
  text-decoration-line: underline;
`

export const ConfirmBidScreen = createRefetchContainer(
  ConfirmBid,
  {
    sale_artwork: graphql`
      fragment ConfirmBid_sale_artwork on SaleArtwork {
        _id
        sale {
          id
          live_start_at
          end_at
        }
        artwork {
          id
          title
          date
          artist_names
        }
        lot_label
        ...BidResult_sale_artwork
      }
    `,
    me: graphql`
      fragment ConfirmBid_me on Me {
        has_qualified_credit_cards
        bidders(sale_id: $saleID) {
          qualified_for_bidding
        }
      }
    `,
  },
  graphql`
    query ConfirmBidRefetchQuery($saleID: String!) {
      me {
        has_qualified_credit_cards
        bidders(sale_id: $saleID) {
          qualified_for_bidding
        }
      }
    }
  `
)

/* tslint:disable */

import { ConcreteFragment } from "relay-runtime";
import { Metadata_show$ref } from "./Metadata_show.graphql";
declare const _Show_show$ref: unique symbol;
export type Show_show$ref = typeof _Show_show$ref;
export type Show_show = {
    readonly href: string | null;
    readonly cover_image: ({
        readonly url: string | null;
    }) | null;
    readonly " $fragmentRefs": Metadata_show$ref;
    readonly " $refType": Show_show$ref;
};



const node: ConcreteFragment = {
  "kind": "Fragment",
  "name": "Show_show",
  "type": "PartnerShow",
  "metadata": null,
  "argumentDefinitions": [],
  "selections": [
    {
      "kind": "ScalarField",
      "alias": null,
      "name": "href",
      "args": null,
      "storageKey": null
    },
    {
      "kind": "LinkedField",
      "alias": null,
      "name": "cover_image",
      "storageKey": null,
      "args": null,
      "concreteType": "Image",
      "plural": false,
      "selections": [
        {
          "kind": "ScalarField",
          "alias": null,
          "name": "url",
          "args": [
            {
              "kind": "Literal",
              "name": "version",
              "value": "large",
              "type": "[String]"
            }
          ],
          "storageKey": "url(version:\"large\")"
        }
      ]
    },
    {
      "kind": "FragmentSpread",
      "name": "Metadata_show",
      "args": null
    },
    {
      "kind": "ScalarField",
      "alias": null,
      "name": "__id",
      "args": null,
      "storageKey": null
    }
  ]
};
(node as any).hash = 'd981d802fad8863bc7fb561582c3e241';
export default node;
